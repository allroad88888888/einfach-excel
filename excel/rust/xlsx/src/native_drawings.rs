//! 原生文件里的浮动对象目录，字段与 `excel/rust/wasm/src/drawings/{persistence,file_ranges}.rs`
//! 写出的 `.einfach.json` 逐一对应：每张表一组对象，引用跨表时带表名。

use serde::{Deserialize, Serialize};

/// 由图表插件解释的种类；其余种类（图片等）XLSX 暂不读写，统一计为「图片或绘图」。
pub const CHART_KIND: &str = "chart";

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct SheetDrawings {
    /// 工作表下标（与 `SheetMeta.idx` 对应）。
    pub sheet: usize,
    #[serde(default)]
    pub drawings: Vec<NativeDrawing>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct NativeDrawing {
    pub id: String,
    pub kind: String,
    pub anchor: NativeAnchor,
    /// 外层 `None` 是 #REF!（引用区域已删光）。
    #[serde(default)]
    pub refs: Vec<Option<NativeRange>>,
    #[serde(default = "empty_payload")]
    pub payload: serde_json::Value,
}

/// 左上角所在单元格 + 格内偏移 + 尺寸，都是 100% 缩放下的 CSS 像素。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeAnchor {
    pub row: u32,
    pub col: u32,
    #[serde(default)]
    pub offset_x: u32,
    #[serde(default)]
    pub offset_y: u32,
    pub width: u32,
    pub height: u32,
}

/// 零基、含两端；`sheet_name` 缺省是对象所在的表。
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeRange {
    pub start_row: u32,
    pub start_col: u32,
    pub end_row: u32,
    pub end_col: u32,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub sheet_name: Option<String>,
}

fn empty_payload() -> serde_json::Value {
    serde_json::Value::Object(Default::default())
}
