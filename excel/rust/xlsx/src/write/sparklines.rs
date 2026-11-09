//! 迷你图组 → 工作表 `extLst` 里的 `x14:sparklineGroups`（Excel 2010 起的扩展，必须是工作表最后一个元素）。

use super::charts::formula::sheet_ref;
use super::xml::escape;
use crate::address::range_name;
use crate::native::NativeFile;
use crate::native_drawings::NativeDrawing;
use crate::native_sparklines::{slots, SPARKLINE_KIND};
use crate::report::ReportBuilder;

const EXT_URI: &str = "{05C60535-1F16-4fd2-B633-F4F36F0B64E0}";

fn flag(payload: &serde_json::Value, key: &str) -> bool {
    payload.get(key).and_then(|value| value.as_bool()).unwrap_or(false)
}

fn color(payload: &serde_json::Value, key: &str, fallback: &str) -> String {
    let hex = payload.get(key).and_then(|value| value.as_str())
        .filter(|text| text.len() == 7 && text.starts_with('#') && text[1..].chars().all(|c| c.is_ascii_hexdigit()))
        .map(|text| &text[1..]).unwrap_or(fallback);
    format!("FF{}", hex.to_ascii_uppercase())
}

fn group(object: &NativeDrawing, sheet_name: &str) -> Option<String> {
    let location = object.refs.first()?.as_ref()?;
    let data = object.refs.get(1)?.as_ref()?;
    let data_sheet = data.sheet_name.as_deref().unwrap_or(sheet_name);
    let lines: String = slots(location, data)?.into_iter().map(|(row, col, slice)| format!(
        "<x14:sparkline><xm:f>{}!{}</xm:f><xm:sqref>{}</xm:sqref></x14:sparkline>",
        escape(&sheet_ref(data_sheet)),
        range_name([slice.start_row, slice.start_col, slice.end_row, slice.end_col]),
        range_name([row, col, row, col]),
    )).collect();
    let p = &object.payload;
    let kind = match p.get("type").and_then(|value| value.as_str()) {
        Some("column") => r#" type="column""#,
        Some("winLoss") => r#" type="stacked""#,
        _ => "",
    };
    let attrs: String = [("markers", "markers"), ("high", "high"), ("low", "low"), ("first", "first"),
        ("last", "last"), ("negative", "negative"), ("axis", "displayXAxis")]
        .iter().filter(|(key, _)| flag(p, key)).map(|(_, name)| format!(r#" {name}="1""#)).collect();
    let colors = [("colorSeries", "color", "376092"), ("colorNegative", "negativeColor", "D00000"),
        ("colorAxis", "", "000000"), ("colorMarkers", "markerColor", "D00000"),
        ("colorFirst", "firstColor", "D00000"), ("colorLast", "lastColor", "D00000"),
        ("colorHigh", "highColor", "D00000"), ("colorLow", "lowColor", "D00000")]
        .iter().map(|(tag, key, fallback)| format!(r#"<x14:{tag} rgb="{}"/>"#, color(p, key, fallback))).collect::<String>();
    Some(format!(r#"<x14:sparklineGroup{kind} displayEmptyCellsAs="gap"{attrs}>{colors}<x14:sparklines>{lines}</x14:sparklines></x14:sparklineGroup>"#))
}

/// 本表全部迷你图组的 `<extLst>`；没有返回空串。位置与数据对不上的组计入 `sparklines`。
pub fn ext_list(file: &NativeFile, index: usize, report: &mut ReportBuilder) -> String {
    let Some(sheet_name) = file.workbook.sheets.get(index).map(|meta| meta.name.as_str()) else { return String::new() };
    let mut groups = String::new();
    for object in file.workbook.drawings.iter().filter(|d| d.sheet == index).flat_map(|d| &d.drawings)
        .filter(|object| object.kind == SPARKLINE_KIND) {
        match group(object, sheet_name) {
            Some(xml) => groups.push_str(&xml),
            None => report.add("sparklines", 1),
        }
    }
    if groups.is_empty() {
        return String::new();
    }
    format!(r#"<extLst><ext uri="{EXT_URI}" xmlns:x14="http://schemas.microsoft.com/office/spreadsheetml/2009/9/main"><x14:sparklineGroups xmlns:xm="http://schemas.microsoft.com/office/excel/2006/main">{groups}</x14:sparklineGroups></ext></extLst>"#)
}
