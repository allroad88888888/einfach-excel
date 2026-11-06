//! 图表通用元素：标题、图例、数据标签、字号、颜色、空单元格与隐藏数据。

use crate::chart_payload::ChartPayload;
use crate::write::xml::escape;

pub const NS: &str = r#"xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships""#;

/// 标题（图表标题与坐标轴标题共用）；空文本返回空串。
pub fn title(text: &str) -> String {
    if text.is_empty() { return String::new(); }
    format!(r#"<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:r><a:t>{}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>"#, escape(text))
}

pub fn auto_title_deleted(p: &ChartPayload) -> &'static str {
    if p.title.is_empty() { r#"<c:autoTitleDeleted val="1"/>"# } else { r#"<c:autoTitleDeleted val="0"/>"# }
}

/// `legend == "none"` 或未知值不写图例。
pub fn legend(p: &ChartPayload) -> String {
    let pos = match p.legend.as_str() { "right" => "r", "bottom" => "b", "top" => "t", "left" => "l", _ => return String::new() };
    format!(r#"<c:legend><c:legendPos val="{pos}"/><c:overlay val="0"/></c:legend>"#)
}

/// 图组级数据标签（只用 showVal）。
pub fn data_labels(p: &ChartPayload) -> &'static str {
    if p.data_labels {
        r#"<c:dLbls><c:showLegendKey val="0"/><c:showVal val="1"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/><c:showBubbleSize val="0"/></c:dLbls>"#
    } else {
        ""
    }
}

pub fn disp_blanks(p: &ChartPayload) -> String {
    let mode = match p.empty_cells.as_str() { "zero" => "zero", "connect" => "span", _ => "gap" };
    format!(r#"<c:plotVisOnly val="{}"/><c:dispBlanksAs val="{mode}"/>"#, if p.show_hidden { 0 } else { 1 })
}

/// chartSpace 级默认字号（磅 × 100）；None 不写。
pub fn font_size(p: &ChartPayload) -> String {
    match p.font_size {
        Some(size) => format!(r#"<c:txPr><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="{}"/></a:pPr><a:endParaRPr lang="en-US"/></a:p></c:txPr>"#, size * 100),
        None => String::new(),
    }
}

/// `#RRGGBB` → `RRGGBB`；其他写法（主题色等）不写。
pub fn color_at(p: &ChartPayload, index: usize) -> Option<String> {
    let text = p.colors.get(index)?.as_deref()?.trim().trim_start_matches('#');
    (text.len() == 6 && text.chars().all(|c| c.is_ascii_hexdigit())).then(|| text.to_ascii_uppercase())
}

pub fn solid(color: &str) -> String {
    format!(r#"<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>"#)
}
