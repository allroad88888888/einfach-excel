//! `<conditionalFormatting>` → 原生条件格式规则。
//! 能表达：cellIs、expression、文本包含/开头/结尾、重复/唯一、前后 N、色阶、数据条，
//! 以及带公式的空白/错误判断（折成公式规则）。图标集、高于平均、日期周期等无对应物，跳过。

use serde_json::{json, Map, Value};

use super::dom::Node;
use super::dxf::color_of;
use crate::address::parse_range;
use crate::formula;
use crate::native::{ConditionalEntry, ConditionalRange, ConditionalScope};

/// 一个 `<conditionalFormatting>` 的作用区域：第一块是主区域，其余是附加区域。
fn scope_of(sqref: &str) -> Option<ConditionalScope> {
    let mut ranges = sqref.split_whitespace().filter_map(parse_range).map(|[r1, c1, r2, c2]| ConditionalRange {
        row_start: r1, row_end: r2, col_start: c1, col_end: c2,
    });
    let range = ranges.next()?;
    Some(ConditionalScope { range, additional_ranges: ranges.collect() })
}

fn comparison(op: &str) -> Option<&'static str> {
    Some(match op {
        "equal" => "eq",
        "notEqual" => "ne",
        "greaterThan" => "gt",
        "greaterThanOrEqual" => "gte",
        "lessThan" => "lt",
        "lessThanOrEqual" => "lte",
        "between" => "between",
        "notBetween" => "not-between",
        _ => return None,
    })
}

fn number_text(source: &str) -> Option<String> {
    source.trim().parse::<f64>().ok().filter(|n| n.is_finite()).map(|_| source.trim().to_string())
}

fn threshold(cfvo: &Node) -> Option<Value> {
    let value = cfvo.attr("val").unwrap_or_default();
    Some(match cfvo.attr("type")? {
        "min" => json!({"type": "min"}),
        "max" => json!({"type": "max"}),
        "num" => json!({"type": "number", "value": number_text(value)?}),
        "percent" => json!({"type": "percent", "value": number_text(value)?}),
        "percentile" => json!({"type": "percentile", "value": number_text(value)?}),
        "formula" => json!({"type": "formula", "value": formula::from_xlsx(value)}),
        _ => return None,
    })
}

fn color_scale(node: &Node, theme: &[String]) -> Option<Value> {
    let cfvos: Vec<&Node> = node.each("cfvo").collect();
    let colors: Vec<String> = node.each("color").map(|c| color_of(c, theme)).collect::<Option<_>>()?;
    let mut rule = Map::new();
    rule.insert("kind".into(), json!("color-scale"));
    match (cfvos.len(), colors.len()) {
        (2, 2) => {}
        (3, 3) => {
            rule.insert("midColor".into(), json!(colors[1]));
            rule.insert("midThreshold".into(), threshold(cfvos[1])?);
        }
        _ => return None,
    }
    let last = colors.len() - 1;
    rule.insert("minColor".into(), json!(colors[0]));
    rule.insert("maxColor".into(), json!(colors[last]));
    rule.insert("minThreshold".into(), threshold(cfvos[0])?);
    rule.insert("maxThreshold".into(), threshold(cfvos[last])?);
    Some(Value::Object(rule))
}

fn data_bar(node: &Node, theme: &[String]) -> Option<Value> {
    let cfvos: Vec<&Node> = node.each("cfvo").collect();
    let color = color_of(node.child("color")?, theme)?;
    let mut rule = Map::new();
    rule.insert("kind".into(), json!("data-bar"));
    rule.insert("maxColor".into(), json!(color));
    // 最小/最大值类型对应原生的"自动"阈值，不写。
    for (cfvo, key) in [(cfvos.first(), "minThreshold"), (cfvos.get(1), "maxThreshold")] {
        if let Some(cfvo) = cfvo.filter(|c| !matches!(c.attr("type"), Some("min" | "max"))) {
            rule.insert(key.into(), threshold(cfvo)?);
        }
    }
    Some(Value::Object(rule))
}

/// 高亮类规则的本体；`format` 取自 dxf。
fn highlight_rule(node: &Node, formulas: &[String], format: Value) -> Option<Value> {
    let kind = node.attr("type")?;
    let mut rule = match kind {
        "cellIs" => {
            let operator = comparison(node.attr("operator")?)?;
            let mut rule = json!({"kind": "cell-value", "operator": operator, "value": number_text(formulas.first()?)?});
            if matches!(operator, "between" | "not-between") {
                rule["value2"] = json!(number_text(formulas.get(1)?)?);
            }
            rule
        }
        "expression" | "containsBlanks" | "notContainsBlanks" | "containsErrors" | "notContainsErrors" => {
            json!({"kind": "formula", "formula": formula::from_xlsx(formulas.first()?)})
        }
        "containsText" | "notContainsText" | "beginsWith" | "endsWith" => {
            let condition = match kind {
                "containsText" => "contains",
                "notContainsText" => "not-contains",
                "beginsWith" => "begins-with",
                _ => "ends-with",
            };
            let text = node.attr("text").filter(|t| !t.is_empty())?;
            json!({"kind": "text", "condition": condition, "text": text})
        }
        "duplicateValues" | "uniqueValues" => {
            json!({"kind": "duplicate-values", "mode": if kind == "uniqueValues" { "unique" } else { "duplicate" }})
        }
        "top10" => {
            let count = node.attr_u32("rank").filter(|n| *n > 0)?;
            json!({"kind": "top-bottom", "direction": if node.attr_bool("bottom", false) { "bottom" } else { "top" },
                "count": count, "percent": node.attr_bool("percent", false)})
        }
        _ => return None,
    };
    rule["format"] = format;
    if node.attr_bool("stopIfTrue", false) {
        rule["stopIfTrue"] = json!(true);
    }
    Some(rule)
}

fn rule_of(node: &Node, dxfs: &[Option<Value>], theme: &[String]) -> Option<Value> {
    match node.attr("type")? {
        "colorScale" => color_scale(node.child("colorScale")?, theme),
        "dataBar" => data_bar(node.child("dataBar")?, theme),
        _ => {
            let format = dxfs.get(node.attr_u32("dxfId")? as usize)?.clone()?;
            let formulas: Vec<String> = node.each("formula").map(|f| f.text.trim().to_string()).collect();
            highlight_rule(node, &formulas, format)
        }
    }
}

pub fn parse(extras: &Node, dxfs: &[Option<Value>], theme: &[String]) -> (Vec<ConditionalEntry>, usize) {
    let mut found: Vec<(i64, ConditionalScope, Value)> = Vec::new();
    let mut skipped = 0usize;
    for group in extras.each("conditionalFormatting") {
        let Some(scope) = group.attr("sqref").and_then(scope_of) else {
            skipped += group.each("cfRule").count().max(1);
            continue;
        };
        for node in group.each("cfRule") {
            if let Some(rule) = rule_of(node, dxfs, theme) {
                found.push((node.attr("priority").and_then(|p| p.parse().ok()).unwrap_or(i64::MAX), scope.clone(), rule));
            } else {
                skipped += 1;
            }
        }
    }
    // Elements inside <extLst> (e.g. x14:conditionalFormattings) are also unsupported rules.
    for ext_list in extras.each("extLst") {
        for ext in ext_list.each("ext") {
            for cfs in ext.each("conditionalFormattings") {
                for cf in cfs.each("conditionalFormatting") {
                    skipped += cf.each("cfRule").count();
                }
            }
        }
    }
    // 优先级数字小的在前；重新编号成连续整数，同值保持文档顺序。
    found.sort_by_key(|(priority, ..)| *priority);
    let entries = found.into_iter().enumerate().map(|(index, (_, scope, rule))| ConditionalEntry {
        id: format!("conditional-format-{}", index + 1), scope, priority: index as i64, rule,
    }).collect();
    (entries, skipped)
}
