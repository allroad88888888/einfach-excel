//! `cx:chartData/cx:data`：公式加缓存点。Excel 对 chartEx 很挑剔，维度必须带 `cx:f` 与 `cx:lvl ptCount`。

use super::model::{Dim, ExSeries};
use crate::write::xml::escape;

fn level(numeric: bool, points: &[Option<String>]) -> String {
    let format = if numeric { r#" formatCode="General""# } else { "" };
    let body: String = points.iter().enumerate()
        .filter_map(|(index, text)| Some(format!(r#"<cx:pt idx="{index}">{}</cx:pt>"#, escape(text.as_ref()?))))
        .collect();
    format!(r#"<cx:lvl ptCount="{}"{format}>{body}</cx:lvl>"#, points.len())
}

fn dim(dim: &Dim) -> String {
    let levels: String = dim.levels.iter().map(|points| level(dim.tag == "numDim", points)).collect();
    format!(r#"<cx:{tag} type="{}"><cx:f>{}</cx:f>{levels}</cx:{tag}>"#, dim.kind, escape(&dim.formula), tag = dim.tag)
}

/// 全部 `cx:data`，`id` 即系列序号（`cx:dataId` 引用它）。
pub fn chart_data(series: &[ExSeries]) -> String {
    let body: String = series.iter().enumerate()
        .map(|(id, s)| format!(r#"<cx:data id="{id}">{}</cx:data>"#, s.dims.iter().map(dim).collect::<String>()))
        .collect();
    format!("<cx:chartData>{body}</cx:chartData>")
}
