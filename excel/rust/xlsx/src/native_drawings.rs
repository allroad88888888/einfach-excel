//! 原生文件里的浮动对象目录（字段对应 `excel/rust/wasm/src/drawings/persistence.rs`）。
//! 目前 XLSX 还不写出浮动对象，这里只读出种类，供导出报告逐项计数，避免不知情地丢失。

use serde::Deserialize;

/// 浮动对象里由图表插件解释的种类；其余种类（图片等）统一计为「图片或绘图」。
pub const CHART_KIND: &str = "chart";

#[derive(Debug, Clone, Default, Deserialize)]
pub struct SheetDrawings {
    #[serde(default)]
    pub drawings: Vec<NativeDrawing>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct NativeDrawing {
    pub kind: String,
}

/// （图表数, 其他对象数）。
pub fn count_by_kind(sheets: &[SheetDrawings]) -> (usize, usize) {
    let all = sheets.iter().flat_map(|sheet| &sheet.drawings);
    let charts = all.clone().filter(|drawing| drawing.kind == CHART_KIND).count();
    (charts, all.count() - charts)
}
