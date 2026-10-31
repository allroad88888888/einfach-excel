//! 原生数据验证 → `<dataValidations>`。
//! 列表条目含逗号（XLSX 的字面量列表以逗号分隔）或超过 255 字符的规则无法安全写出，整条跳过。

use super::xml::escape;
use crate::address::range_name;
use crate::date_serial;
use crate::formula;
use crate::native::{Bound, SheetValidation, ValidationRegion, ValidationRule};

const MAX_LITERAL_LIST_CHARS: usize = 255;

fn operator(name: &str) -> Option<&'static str> {
    Some(match name {
        "between" => "between",
        "not-between" => "notBetween",
        "equal" => "equal",
        "not-equal" => "notEqual",
        "greater-than" => "greaterThan",
        "greater-than-or-equal" => "greaterThanOrEqual",
        "less-than" => "lessThan",
        "less-than-or-equal" => "lessThanOrEqual",
        _ => return None,
    })
}

fn bound_text(kind: &str, bound: &Bound) -> Option<String> {
    Some(match (kind, bound) {
        (_, Bound::Number(n)) if n.is_finite() => n.to_string(),
        ("date", Bound::Text(text)) => date_serial::iso_to_serial(text)?.to_string(),
        ("time", Bound::Text(text)) => date_serial::clock_to_fraction(text)?.to_string(),
        _ => return None,
    })
}

/// 规则种类、运算符与两个公式；None 表示该规则写不出。
fn parts(region: &ValidationRegion) -> Option<(&'static str, Option<&'static str>, String, Option<String>)> {
    let rule: &ValidationRule = &region.rule;
    let op = operator(rule.operator.as_deref().unwrap_or("between"))?;
    let ranged = matches!(op, "between" | "notBetween");
    let kind = match rule.kind.as_str() {
        "whole-number" => "whole",
        "decimal" => "decimal",
        "text-length" => "textLength",
        "date" => "date",
        "time" => "time",
        "list" => {
            let items = rule.items.as_ref()?;
            if items.is_empty() || items.iter().any(|i| i.contains(',')) {
                return None;
            }
            let literal = items.join(",").replace('"', "\"\"");
            if literal.chars().count() > MAX_LITERAL_LIST_CHARS {
                return None;
            }
            return Some(("list", None, format!("\"{literal}\""), None));
        }
        "custom-formula" => {
            let anchor = rule.anchor.as_ref().map_or((0, 0), |a| (a.row, a.col));
            let body = formula::to_xlsx(rule.formula.as_deref()?);
            // XLSX 的自定义公式相对于区域左上角，原生相对于锚点。
            let shifted = formula::shift(&body, i64::from(region.range[0]) - i64::from(anchor.0),
                i64::from(region.range[1]) - i64::from(anchor.1));
            return Some(("custom", None, shifted, None));
        }
        _ => return None,
    };
    let min = bound_text(kind, rule.min.as_ref()?)?;
    let max = if ranged { Some(bound_text(kind, rule.max.as_ref()?)?) } else { None };
    Some((kind, (op != "between").then_some(op), min, max))
}

fn element(region: &ValidationRegion) -> Option<String> {
    let (kind, op, formula1, formula2) = parts(region)?;
    let rule = &region.rule;
    let mut attrs = format!(r#" type="{kind}""#);
    if let Some(op) = op {
        attrs.push_str(&format!(r#" operator="{op}""#));
    }
    if rule.ignore_blank {
        attrs.push_str(r#" allowBlank="1""#);
    }
    if kind == "list" {
        attrs.push_str(r#" showDropDown="0""#);
    }
    if let Some(input) = &rule.input_message {
        attrs.push_str(&format!(r#" showInputMessage="1" promptTitle="{}" prompt="{}""#,
            escape(&input.title), escape(&input.message)));
    }
    let alert = rule.error_alert.as_ref();
    attrs.push_str(r#" showErrorMessage="1""#);
    if let Some(alert) = alert {
        let style = if alert.style == "stop" { "stop" } else if alert.style == "warning" { "warning" } else { "information" };
        attrs.push_str(&format!(r#" errorStyle="{style}" errorTitle="{}" error="{}""#, escape(&alert.title), escape(&alert.message)));
    }
    let second = formula2.map(|f| format!("<formula2>{}</formula2>", escape(&f))).unwrap_or_default();
    Some(format!(r#"<dataValidation{attrs} sqref="{}"><formula1>{}</formula1>{second}</dataValidation>"#,
        range_name(region.range), escape(&formula1)))
}

pub fn xml(validations: &[&SheetValidation]) -> String {
    let items: Vec<String> = validations.iter().flat_map(|sheet| &sheet.regions).filter_map(element).collect();
    if items.is_empty() {
        return String::new();
    }
    format!(r#"<dataValidations count="{}">{}</dataValidations>"#, items.len(), items.concat())
}
