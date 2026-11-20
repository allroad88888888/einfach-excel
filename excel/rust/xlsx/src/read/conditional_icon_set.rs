//! `<cfRule type="iconSet">` → 原生三段图标集规则（`kind: "icon-set"`）。
//! 仅接收原生引擎支持的 3 图标家族与 `gte="1"`（`>=`）阈值；4/5 图标集、`gte="0"` 或自定义图标分档如实计入跳过报告。

use serde_json::{json, Map, Value};

use super::dom::Node;
use crate::formula;

fn boolean(node: &Node, name: &str, fallback: bool) -> Option<bool> {
    match node.attr(name).map(str::trim) {
        None => Some(fallback),
        Some("1" | "true") => Some(true),
        Some("0" | "false") => Some(false),
        _ => None,
    }
}

fn icon_set_name(raw: Option<&str>) -> Option<&'static str> {
    match raw.map(str::trim) {
        None | Some("3TrafficLights1" | "3TrafficLights2") => Some("three-traffic-lights"),
        Some("3Arrows" | "3ArrowsGray") => Some("three-arrows"),
        Some("3Flags") => Some("three-flags"),
        _ => None,
    }
}

fn finite_number(source: &str) -> Option<(f64, String)> {
    let trimmed = source.trim();
    let n = trimmed.parse::<f64>().ok().filter(|n| n.is_finite())?;
    Some((n, trimmed.to_string()))
}

fn threshold(cfvo: &Node) -> Option<Value> {
    let raw = cfvo.attr("val").unwrap_or_default();
    Some(match cfvo.attr("type")?.trim() {
        "min" => json!({ "type": "min" }),
        "max" => json!({ "type": "max" }),
        "num" => {
            let (_, text) = finite_number(raw)?;
            json!({ "type": "number", "value": text })
        }
        kind @ ("percent" | "percentile") => {
            let (n, text) = finite_number(raw)?;
            if !(0.0..=100.0).contains(&n) {
                return None;
            }
            json!({ "type": kind, "value": text })
        }
        "formula" => {
            let trimmed = raw.trim();
            if trimmed.is_empty() {
                return None;
            }
            json!({ "type": "formula", "value": formula::from_xlsx(trimmed) })
        }
        _ => return None,
    })
}

pub(super) fn parse(cf_rule: &Node) -> Option<Value> {
    let icon_node = cf_rule.child("iconSet")?;
    if boolean(icon_node, "custom", false)? || icon_node.child("cfIcon").is_some() {
        return None;
    }
    let set = icon_set_name(icon_node.attr("iconSet"))?;
    let show_value = boolean(icon_node, "showValue", true)?;
    let reverse = boolean(icon_node, "reverse", false)?;
    let cfvos: Vec<&Node> = icon_node.each("cfvo").collect();
    if cfvos.len() != 3 {
        return None;
    }
    // 第 0 个 cfvo 是最低档下界占位，仍校验属性语法；第 1、2 个 cfvo 对应 lower/upper，原生固定按 `>=` 判定。
    let _ = threshold(cfvos[0])?;
    let _ = boolean(cfvos[0], "gte", true)?;
    if !boolean(cfvos[1], "gte", true)? || !boolean(cfvos[2], "gte", true)? {
        return None;
    }
    let lower = threshold(cfvos[1])?;
    let upper = threshold(cfvos[2])?;

    let mut rule = Map::new();
    rule.insert("kind".into(), json!("icon-set"));
    rule.insert("iconSet".into(), json!(set));
    rule.insert("lowerThreshold".into(), lower);
    rule.insert("upperThreshold".into(), upper);
    if reverse {
        rule.insert("reverse".into(), json!(true));
    }
    if !show_value {
        rule.insert("showValue".into(), json!(false));
    }
    Some(Value::Object(rule))
}
