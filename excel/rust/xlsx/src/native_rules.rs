//! 原生文件里的"规则类"字段：数据验证与条件格式。字段名取自真实快照。

use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SheetValidation {
    pub sheet: usize,
    pub regions: Vec<ValidationRegion>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ValidationRegion {
    /// `[startRow, startCol, endRow, endCol]`
    pub range: [u32; 4],
    pub rule: ValidationRule,
}

/// kind：whole-number / decimal / date / time / text-length / list / custom-formula。
/// 区间类规则用 `min`/`max`；比较类运算符（非 between）只看 `min`。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ValidationRule {
    pub kind: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub min: Option<Bound>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max: Option<Bound>,
    /// between / not-between / equal / not-equal / greater-than / greater-than-or-equal /
    /// less-than / less-than-or-equal；缺省为 between。
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub operator: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub items: Option<Vec<String>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub formula: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub anchor: Option<Anchor>,
    #[serde(default = "yes")]
    pub ignore_blank: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub input_message: Option<InputMessage>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub error_alert: Option<ErrorAlert>,
}

fn yes() -> bool {
    true
}

/// 数值规则是数字，日期/时间规则是 `2026-01-31` / `08:30` 文本。
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum Bound {
    Number(f64),
    Text(String),
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Anchor {
    pub row: u32,
    pub col: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct InputMessage {
    pub title: String,
    pub message: String,
}

/// style：stop / warning / information
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ErrorAlert {
    pub style: String,
    pub title: String,
    pub message: String,
}

/// 每个工作表一份规则配置；`revision` 由引擎在 restore 时自管，导入写 0。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SheetConditional {
    pub sheet: u32,
    #[serde(default)]
    pub revision: u64,
    pub rules: Vec<ConditionalEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalEntry {
    pub id: String,
    pub scope: ConditionalScope,
    /// 数字小的优先，与 XLSX 的 priority 同向。
    pub priority: i64,
    /// 规则本体形状由引擎的 `NativeRule::parse` 定义（kind: cell-value / formula / text /
    /// top-bottom / duplicate-values / color-scale / data-bar / icon-set），这里按 JSON 透传。
    pub rule: Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalScope {
    pub range: ConditionalRange,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub additional_ranges: Vec<ConditionalRange>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConditionalRange {
    pub row_start: u32,
    pub row_end: u32,
    pub col_start: u32,
    pub col_end: u32,
}
