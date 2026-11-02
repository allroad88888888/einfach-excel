//! `<dataValidations>` → 原生数据验证。
//! 原生规则只认字面量边界与显式列表：引用/公式型边界、引用型列表、`any` 类型都无法表达，整条跳过。

use super::dom::Node;
use crate::address::parse_range;
use crate::date_serial;
use crate::formula;
use crate::native::{Anchor, Bound, ErrorAlert, InputMessage, ValidationRegion, ValidationRule};

const MAX_REGIONS: usize = 4096;
const MAX_LIST_ITEMS: usize = 1024;
const MAX_LIST_BYTES: usize = 64 * 1024;

fn operator_name(op: &str) -> Option<&'static str> {
    Some(match op {
        "between" => "between",
        "notBetween" => "not-between",
        "equal" => "equal",
        "notEqual" => "not-equal",
        "greaterThan" => "greater-than",
        "greaterThanOrEqual" => "greater-than-or-equal",
        "lessThan" => "less-than",
        "lessThanOrEqual" => "less-than-or-equal",
        _ => return None,
    })
}

/// `"a,b,c"` 字面量列表（内部引号写成 `""`）→ 条目；区域引用返回 None。
fn list_items(source: &str) -> Option<Vec<String>> {
    let inner = source.trim().strip_prefix('"')?.strip_suffix('"')?.replace("\"\"", "\"");
    let items: Vec<String> = inner.split(',').map(str::to_string).collect();
    let bytes: usize = items.iter().map(String::len).sum();
    let ok = !items.is_empty() && items.len() <= MAX_LIST_ITEMS && bytes <= MAX_LIST_BYTES
        && items.iter().all(|item| !item.is_empty() && !item.contains(['\r', '\n', '\0']));
    ok.then_some(items)
}

fn literal(kind: &str, text: &str, date1904: bool) -> Option<Bound> {
    let mut number: f64 = text.trim().parse().ok().filter(|n: &f64| n.is_finite())?;
    if kind == "date" && date1904 {
        number += 1462.0;
    }
    match kind {
        "date" => date_serial::serial_to_iso(number).map(Bound::Text),
        "time" => date_serial::fraction_to_clock(number).map(Bound::Text),
        "textLength" => (number >= 0.0 && number.fract() == 0.0).then_some(Bound::Number(number)),
        "whole" => (number.fract() == 0.0).then_some(Bound::Number(number)),
        _ => Some(Bound::Number(number)),
    }
}

fn messages(rule: &mut ValidationRule, node: &Node) {
    let cut = |text: &str, max: usize| text.chars().filter(|c| *c != '\0').take(max).collect::<String>();
    let (prompt_title, prompt) = (node.attr("promptTitle").unwrap_or_default(), node.attr("prompt").unwrap_or_default());
    if node.attr_bool("showInputMessage", false) && !(prompt_title.is_empty() && prompt.is_empty()) {
        rule.input_message = Some(InputMessage { title: cut(prompt_title, 32), message: cut(prompt, 255) });
    }
    let style = match node.attr("errorStyle") {
        Some("warning") => "warning",
        Some("information") => "information",
        _ => "stop",
    };
    let (title, message) = (node.attr("errorTitle").unwrap_or_default(), node.attr("error").unwrap_or_default());
    if node.attr_bool("showErrorMessage", false) && (style != "stop" || !title.is_empty() || !message.is_empty()) {
        rule.error_alert = Some(ErrorAlert { style: style.into(), title: cut(title, 32), message: cut(message, 255) });
    }
}

fn rule_of(node: &Node, anchor: (u32, u32), date1904: bool) -> Option<ValidationRule> {
    let kind = node.attr("type").unwrap_or("none");
    let formula1 = node.child("formula1").map(|n| n.text.trim().to_string()).unwrap_or_default();
    let formula2 = node.child("formula2").map(|n| n.text.trim().to_string()).unwrap_or_default();
    let mut rule = ValidationRule {
        kind: String::new(), min: None, max: None, operator: None, items: None, formula: None, anchor: None,
        ignore_blank: node.attr_bool("allowBlank", false), input_message: None, error_alert: None,
    };
    match kind {
        "list" => {
            rule.kind = "list".into();
            rule.items = Some(list_items(&formula1)?);
        }
        "custom" => {
            if formula1.is_empty() {
                return None;
            }
            rule.kind = "custom-formula".into();
            rule.formula = Some(formula::from_xlsx(&formula1));
            rule.anchor = Some(Anchor { row: anchor.0, col: anchor.1 });
        }
        "whole" | "decimal" | "textLength" | "date" | "time" => {
            let operator = operator_name(node.attr("operator").unwrap_or("between"))?;
            rule.kind = match kind {
                "whole" => "whole-number",
                "textLength" => "text-length",
                other => other,
            }.into();
            let min = literal(kind, &formula1, date1904)?;
            let ranged = matches!(operator, "between" | "not-between");
            let max = if ranged { literal(kind, &formula2, date1904)? } else { min.clone() };
            if ranged && bound_value(&min) > bound_value(&max) {
                return None;
            }
            (rule.min, rule.max) = (Some(min), Some(max));
            if operator != "between" {
                rule.operator = Some(operator.into());
            }
        }
        _ => return None,
    }
    messages(&mut rule, node);
    Some(rule)
}

/// 区间校验用的可比较值：日期 `YYYY-MM-DD` 与时间 `HH:MM` 的字典序即时间序。
fn bound_value(bound: &Bound) -> (f64, &str) {
    match bound {
        Bound::Number(n) => (*n, ""),
        Bound::Text(t) => (0.0, t.as_str()),
    }
}

pub fn parse(extras: &Node, date1904: bool) -> (Vec<ValidationRegion>, usize) {
    let Some(validations) = extras.child("dataValidations") else { return (Vec::new(), 0) };
    let mut out = Vec::new();
    let mut skipped = 0usize;
    for node in validations.each("dataValidation") {
        let ranges: Vec<[u32; 4]> = node.attr("sqref").unwrap_or_default()
            .split_whitespace().filter_map(parse_range).collect();
        let Some(first) = ranges.first() else {
            skipped += 1;
            continue;
        };
        let Some(rule) = rule_of(node, (first[0], first[1]), date1904) else {
            skipped += 1;
            continue;
        };
        for range in ranges {
            if out.len() < MAX_REGIONS {
                out.push(ValidationRegion { range, rule: rule.clone() });
            } else {
                skipped += 1;
            }
        }
    }
    for ext_list in extras.each("extLst") {
        for ext in ext_list.each("ext") {
            for dvs in ext.each("dataValidations") {
                skipped += dvs.each("dataValidation").count();
            }
        }
    }
    (out, skipped)
}
