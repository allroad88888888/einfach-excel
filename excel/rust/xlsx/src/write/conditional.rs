//! 原生条件格式 → `<conditionalFormatting>` + dxf。
//! 图标集、已停用的规则、写不出差异样式的规则跳过；数据条的负值色 XLSX 里在扩展节，不写。

use serde_json::Value;

use super::styles::StyleTable;
use super::xml::escape;
use crate::address::{cell_name, range_name};
use crate::color::to_argb;
use crate::formula;
use crate::native::{ConditionalEntry, SheetConditional};

fn sqref(entry: &ConditionalEntry) -> String {
    let range = |r: &crate::native::ConditionalRange| range_name([r.row_start, r.col_start, r.row_end, r.col_end]);
    let mut parts = vec![range(&entry.scope.range)];
    parts.extend(entry.scope.additional_ranges.iter().map(range));
    parts.join(" ")
}

fn text_of(value: &Value) -> Option<String> {
    match value {
        Value::String(text) => Some(text.clone()),
        Value::Number(number) => Some(number.to_string()),
        _ => None,
    }
}

fn formula_body(source: &str) -> String {
    escape(formula::to_xlsx(source).trim_start_matches('='))
}

/// 阈值 → `<cfvo>`；缺省阈值按 `fallback` 写（min / max / percentile 50）。
fn cfvo(threshold: &Value, fallback: &str) -> Option<String> {
    let value = text_of(&threshold["value"]).unwrap_or_default();
    let (kind, val) = if threshold.is_null() {
        match fallback {
            "percentile" => ("percentile", "50".to_string()),
            other => (if other == "max" { "max" } else { "min" }, String::new()),
        }
    } else {
        match threshold["type"].as_str()? {
            "min" => ("min", String::new()),
            "max" => ("max", String::new()),
            "number" => ("num", value),
            "percent" => ("percent", value),
            "percentile" => ("percentile", value),
            "formula" => ("formula", formula::to_xlsx(&value).trim_start_matches('=').to_string()),
            _ => return None,
        }
    };
    Some(if val.is_empty() {
        format!(r#"<cfvo type="{kind}"/>"#)
    } else {
        format!(r#"<cfvo type="{kind}" val="{}"/>"#, escape(&val))
    })
}

fn color_scale(rule: &Value) -> Option<String> {
    let color = |key: &str| rule[key].as_str().and_then(to_argb);
    let mid = rule["midColor"].as_str().is_some();
    let mut cfvos = vec![cfvo(&rule["minThreshold"], "min")?];
    let mut colors = vec![color("minColor")?];
    if mid {
        cfvos.push(cfvo(&rule["midThreshold"], "percentile")?);
        colors.push(color("midColor")?);
    }
    cfvos.push(cfvo(&rule["maxThreshold"], "max")?);
    colors.push(color("maxColor")?);
    let colors: String = colors.iter().map(|argb| format!(r#"<color rgb="{argb}"/>"#)).collect();
    Some(format!("<colorScale>{}{colors}</colorScale>", cfvos.concat()))
}

fn data_bar(rule: &Value) -> Option<String> {
    let argb = rule["maxColor"].as_str().and_then(to_argb).unwrap_or_else(|| "FF638EC6".into());
    Some(format!(r#"<dataBar>{}{}<color rgb="{argb}"/></dataBar>"#,
        cfvo(&rule["minThreshold"], "min")?, cfvo(&rule["maxThreshold"], "max")?))
}

/// 文本规则没有直接的 XLSX 通配类型，通配匹配用 COUNTIF 表达；其余用 Excel 自己写的判断公式。
fn text_formula(condition: &str, text: &str, cell: &str) -> Option<(String, &'static str)> {
    let quoted = format!("\"{}\"", text.replace('"', "\"\""));
    Some(match condition {
        "contains" => (format!("NOT(ISERROR(SEARCH({quoted},{cell})))"), "containsText"),
        "not-contains" => (format!("ISERROR(SEARCH({quoted},{cell}))"), "notContainsText"),
        "begins-with" => (format!("LEFT({cell},LEN({quoted}))={quoted}"), "beginsWith"),
        "ends-with" => (format!("RIGHT({cell},LEN({quoted}))={quoted}"), "endsWith"),
        "matches-wildcard" => (format!("COUNTIF({cell},{quoted})>0"), "expression"),
        "not-matches-wildcard" => (format!("COUNTIF({cell},{quoted})=0"), "expression"),
        _ => return None,
    })
}

fn comparison(op: &str) -> Option<&'static str> {
    Some(match op {
        "eq" => "equal",
        "ne" => "notEqual",
        "gt" => "greaterThan",
        "gte" => "greaterThanOrEqual",
        "lt" => "lessThan",
        "lte" => "lessThanOrEqual",
        "between" => "between",
        "not-between" => "notBetween",
        _ => return None,
    })
}

fn rule_xml(entry: &ConditionalEntry, priority: usize, styles: &mut StyleTable) -> Option<String> {
    let rule = &entry.rule;
    if rule["enabled"].as_bool() == Some(false) {
        return None;
    }
    let head = |kind: &str| format!(r#"<cfRule type="{kind}" priority="{priority}""#);
    let dxf = |styles: &mut StyleTable| styles.dxf(&rule["format"]).map(|id| format!(r#" dxfId="{id}""#));
    let stop = if rule["stopIfTrue"].as_bool() == Some(true) { r#" stopIfTrue="1""# } else { "" };
    let cell = cell_name(entry.scope.range.row_start, entry.scope.range.col_start);
    match rule["kind"].as_str()? {
        "color-scale" => Some(format!("{}>{}</cfRule>", head("colorScale"), color_scale(rule)?)),
        "data-bar" => Some(format!("{}>{}</cfRule>", head("dataBar"), data_bar(rule)?)),
        "cell-value" => {
            let operator = comparison(rule["operator"].as_str()?)?;
            let mut formulas = format!("<formula>{}</formula>", escape(&text_of(&rule["value"])?));
            if matches!(operator, "between" | "notBetween") {
                formulas.push_str(&format!("<formula>{}</formula>", escape(&text_of(&rule["value2"])?)));
            }
            Some(format!(r#"{}{} operator="{operator}"{stop}>{formulas}</cfRule>"#, head("cellIs"), dxf(styles)?))
        }
        "formula" => {
            let body = formula_body(rule["formula"].as_str()?);
            Some(format!("{}{}{stop}><formula>{body}</formula></cfRule>", head("expression"), dxf(styles)?))
        }
        "text" => {
            let text = rule["text"].as_str()?;
            let (body, kind) = text_formula(rule["condition"].as_str()?, text, &cell)?;
            let attrs = if kind == "expression" { String::new() } else {
                let op = if kind == "notContainsText" { "notContains" } else { kind };
                format!(r#" operator="{op}" text="{}""#, escape(text))
            };
            Some(format!("{}{}{attrs}{stop}><formula>{}</formula></cfRule>", head(kind), dxf(styles)?, escape(&body)))
        }
        "duplicate-values" => {
            let kind = if rule["mode"].as_str() == Some("unique") { "uniqueValues" } else { "duplicateValues" };
            Some(format!("{}{}{stop}/>", head(kind), dxf(styles)?))
        }
        "top-bottom" => {
            let count = rule["count"].as_u64()?;
            let bottom = if rule["direction"].as_str() == Some("bottom") { r#" bottom="1""# } else { "" };
            let percent = if rule["percent"].as_bool() == Some(true) { r#" percent="1""# } else { "" };
            Some(format!(r#"{}{} rank="{count}"{percent}{bottom}{stop}/>"#, head("top10"), dxf(styles)?))
        }
        _ => None,
    }
}

pub fn xml(configs: &[&SheetConditional], styles: &mut StyleTable) -> String {
    let mut entries: Vec<&ConditionalEntry> = configs.iter().flat_map(|config| &config.rules).collect();
    entries.sort_by_key(|entry| entry.priority);
    let mut out = String::new();
    let mut priority = 0;
    for entry in entries {
        if let Some(rule) = rule_xml(entry, priority + 1, styles) {
            priority += 1;
            out.push_str(&format!(r#"<conditionalFormatting sqref="{}">{rule}</conditionalFormatting>"#, sqref(entry)));
        }
    }
    out
}
