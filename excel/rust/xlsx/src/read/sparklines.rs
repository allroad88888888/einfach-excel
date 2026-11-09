//! 工作表 `extLst` 里的 `x14:sparklineGroups` → 迷你图组对象（`refs = [位置, 数据]`）。
//! 一组里各条迷你图能拼成「一行或一列位置 + 一块数据」时保持一组，否则每条单独成组（设置相同）。
//! 数据用定义名、外部引用、多块区域等认不出的写法时整组跳过，计入 `sparklines`。

use super::charts::formula::{parse_formula, same_sheet, SheetRect};
use super::dom::Node;
use crate::address::parse_range;
use crate::native_drawings::{NativeAnchor, NativeDrawing, NativeRange};
use crate::native_sparklines::{slots, SPARKLINE_KIND};

struct Line {
    row: u32,
    col: u32,
    data: SheetRect,
}

fn color(group: &Node, tag: &str) -> Option<String> {
    let rgb = group.child(tag)?.attr("rgb")?;
    let hex = rgb.get(rgb.len().checked_sub(6)?..)?;
    hex.chars().all(|c| c.is_ascii_hexdigit()).then(|| format!("#{}", hex.to_ascii_uppercase()))
}

fn payload(group: &Node) -> serde_json::Value {
    let mut spec = serde_json::Map::new();
    spec.insert("type".into(), match group.attr("type") {
        Some("column") => "column",
        Some("stacked") => "winLoss",
        _ => "line",
    }.into());
    for (key, attr) in [("markers", "markers"), ("high", "high"), ("low", "low"), ("first", "first"),
        ("last", "last"), ("negative", "negative"), ("axis", "displayXAxis")] {
        spec.insert(key.into(), group.attr_bool(attr, false).into());
    }
    for (key, tag) in [("color", "colorSeries"), ("negativeColor", "colorNegative"), ("markerColor", "colorMarkers"),
        ("firstColor", "colorFirst"), ("lastColor", "colorLast"), ("highColor", "colorHigh"), ("lowColor", "colorLow")] {
        if let Some(value) = color(group, tag) {
            spec.insert(key.into(), value.into());
        }
    }
    serde_json::Value::Object(spec)
}

fn native_range(rect: [u32; 4], sheet: Option<String>) -> NativeRange {
    NativeRange { start_row: rect[0], start_col: rect[1], end_row: rect[2], end_col: rect[3], sheet_name: sheet }
}

fn drawing(location: NativeRange, data: NativeRange, payload: &serde_json::Value) -> NativeDrawing {
    NativeDrawing {
        id: String::new(),
        kind: SPARKLINE_KIND.into(),
        anchor: NativeAnchor { row: location.start_row, col: location.start_col, offset_x: 0, offset_y: 0, width: 16, height: 16 },
        refs: vec![Some(location), Some(data)],
        payload: payload.clone(),
        media: None,
    }
}

/// 整组拼成一个对象：位置连续成一行或一列，各条数据合起来再按同一规则切回来正好一致。
fn whole_group(lines: &[Line], own: &str) -> Option<(NativeRange, NativeRange)> {
    let first = lines.first()?;
    let sheet = &first.data.sheet;
    if lines.iter().any(|line| !same_sheet(&line.data.sheet, sheet)) {
        return None;
    }
    let rows = (lines.iter().map(|l| l.row).min()?, lines.iter().map(|l| l.row).max()?);
    let cols = (lines.iter().map(|l| l.col).min()?, lines.iter().map(|l| l.col).max()?);
    let location = native_range([rows.0, cols.0, rows.1, cols.1], None);
    let data_rect = [
        lines.iter().map(|l| l.data.rect[0]).min()?, lines.iter().map(|l| l.data.rect[1]).min()?,
        lines.iter().map(|l| l.data.rect[2]).max()?, lines.iter().map(|l| l.data.rect[3]).max()?,
    ];
    let data_sheet = (!sheet.is_empty() && !same_sheet(sheet, own)).then(|| sheet.clone());
    let data = native_range(data_rect, data_sheet);
    let expected = slots(&location, &data)?;
    let matches = expected.len() == lines.len() && expected.iter().all(|(row, col, slice)| lines.iter().any(|line|
        line.row == *row && line.col == *col
            && line.data.rect == [slice.start_row, slice.start_col, slice.end_row, slice.end_col]));
    matches.then_some((location, data))
}

/// `own`：工作表在 XLSX 里的原始名。返回对象（id 待分配、表名待换成引擎名）与跳过的组数。
pub fn parse(extras: &Node, own: &str) -> (Vec<NativeDrawing>, usize) {
    let (mut out, mut skipped) = (Vec::new(), 0);
    for ext in extras.each("extLst").flat_map(|list| list.each("ext")) {
        for group in ext.each("sparklineGroups").flat_map(|groups| groups.each("sparklineGroup")) {
            let spec = payload(group);
            let lines: Option<Vec<Line>> = group.child("sparklines").into_iter()
                .flat_map(|list| list.each("sparkline"))
                .map(|line| {
                    let [row, col, ..] = parse_range(line.child("sqref")?.text.trim())?;
                    let mut rects = parse_formula(line.child("f")?.text.trim())?;
                    (rects.len() == 1).then_some(())?;
                    Some(Line { row, col, data: rects.pop()? })
                })
                .collect();
            let Some(lines) = lines.filter(|lines| !lines.is_empty()) else { skipped += 1; continue };
            if let Some((location, data)) = whole_group(&lines, own) {
                out.push(drawing(location, data, &spec));
                continue;
            }
            for line in &lines {
                let location = native_range([line.row, line.col, line.row, line.col], None);
                let sheet = (!line.data.sheet.is_empty() && !same_sheet(&line.data.sheet, own)).then(|| line.data.sheet.clone());
                let data = native_range(line.data.rect, sheet);
                if slots(&location, &data).is_some() {
                    out.push(drawing(location, data, &spec));
                } else {
                    skipped += 1;
                }
            }
        }
    }
    (out, skipped)
}
