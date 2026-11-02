//! 单张 `sheetN.xml`：单元格值与公式、样式索引、列宽行高、合并区、冻结窗格。

use std::collections::HashMap;

use quick_xml::events::{BytesStart, Event};
use quick_xml::Reader;

use super::xml::{attr, attr_bool, attr_f64, attr_u32, local_name, text_of};
use crate::address::{parse_cell, parse_range};
use crate::formula;
use crate::native::CellValue;
use crate::units::{column_width_to_px, row_height_to_px};
use crate::XlsxError;

/// 整列样式会写成 min=1 max=16384；只有显式宽度才逐列展开，避免生成上万条尺寸。
const MAX_STYLED_COLUMN_SPAN: u32 = 1024;

pub struct RawCell {
    pub row: u32,
    pub col: u32,
    pub style: u32,
    /// (kind, value)：number / text / boolean / error / formula
    pub content: Option<(&'static str, CellValue)>,
}

#[derive(Default)]
pub struct SheetData {
    pub cells: Vec<RawCell>,
    pub col_widths: Vec<(u32, u32)>,
    pub row_heights: Vec<(u32, u32)>,
    pub merges: Vec<[u32; 4]>,
    pub freeze: Option<(u32, u32)>,
    pub hidden_rows: Vec<u32>,
    pub hidden_cols: Vec<u32>,
    pub rich_text: usize,
    pub outline: usize,
}

#[derive(Default)]
struct PendingCell {
    row: u32,
    col: u32,
    style: u32,
    kind: String,
    value: String,
    inline: String,
    rich: bool,
    formula: Option<String>,
    shared: Option<String>,
    array_ref: Option<String>,
}

enum Text { None, Value, Formula, Inline }

fn finish(
    cell: PendingCell,
    strings: &[String],
    shared: &mut HashMap<String, (u32, u32, String)>,
    arrays: &mut Vec<[u32; 4]>,
) -> RawCell {
    let mut source = cell.formula.filter(|text| !text.is_empty());
    if let Some(index) = &cell.shared {
        match &source {
            Some(text) => {
                shared.insert(index.clone(), (cell.row, cell.col, text.clone()));
            }
            None => {
                source = shared.get(index).map(|(row, col, text)| formula::shift(
                    text, i64::from(cell.row) - i64::from(*row), i64::from(cell.col) - i64::from(*col)));
            }
        }
    }
    if let Some(range) = cell.array_ref.as_deref().and_then(parse_range) {
        arrays.push(range);
    }
    let content = if let Some(text) = source {
        Some(("formula", CellValue::Text(formula::from_xlsx(&text))))
    } else {
        let value = cell.value;
        match cell.kind.as_str() {
            "s" => value.trim().parse::<usize>().ok()
                .and_then(|index| strings.get(index))
                .map(|text| ("text", CellValue::Text(text.clone()))),
            "b" => Some(("boolean", CellValue::Boolean(value.trim() == "1"))),
            "e" => Some(("error", CellValue::Text(value))),
            "inlineStr" => Some(("text", CellValue::Text(cell.inline))),
            "str" | "d" => Some(("text", CellValue::Text(value))),
            _ if value.trim().is_empty() => None,
            _ => value.trim().parse::<f64>().ok().map(|n| ("number", CellValue::Number(n))),
        }
    };
    RawCell { row: cell.row, col: cell.col, style: cell.style, content }
}

fn column_entries(e: &BytesStart, data: &mut SheetData) {
    let (Some(min), Some(max)) = (attr_u32(e, "min"), attr_u32(e, "max")) else { return };
    let custom = attr_bool(e, "customWidth", false);
    if min == 0 || max < min {
        return;
    }
    if attr_u32(e, "outlineLevel").is_some_and(|l| l > 0) || attr_bool(e, "collapsed", false) {
        data.outline += 1;
    }
    if attr_bool(e, "hidden", false) {
        data.hidden_cols.extend((min - 1)..max.min(crate::native::MAX_COLS));
        return;
    }
    if !custom && max - min >= MAX_STYLED_COLUMN_SPAN {
        return;
    }
    let Some(width) = attr_f64(e, "width") else { return };
    let px = column_width_to_px(width);
    for col in (min - 1)..max.min(crate::native::MAX_COLS) {
        data.col_widths.push((col, px));
    }
}

pub fn parse(xml: &str, strings: &[String]) -> Result<SheetData, XlsxError> {
    let mut data = SheetData::default();
    let mut shared = HashMap::new();
    let mut arrays = Vec::new();
    let mut reader = Reader::from_str(xml);
    let mut cell: Option<PendingCell> = None;
    let mut text = Text::None;
    let mut phonetic = 0usize;
    // 省略 r 的行按顺序递增，从第 0 行开始。
    let (mut row, mut next_col) = (u32::MAX, 0u32);
    loop {
        let event = reader.read_event().map_err(|_| XlsxError::new("A worksheet is not well-formed XML."))?;
        let empty = matches!(event, Event::Empty(_));
        match event {
            Event::Start(e) | Event::Empty(e) if cell.is_none() => match local_name(&e).as_slice() {
                b"row" => {
                    row = attr_u32(&e, "r").map_or(row.wrapping_add(1), |r| r.saturating_sub(1));
                    next_col = 0;
                    if attr_u32(&e, "outlineLevel").is_some_and(|l| l > 0) || attr_bool(&e, "collapsed", false) {
                        data.outline += 1;
                    }
                    if attr_bool(&e, "hidden", false) {
                        data.hidden_rows.push(row);
                    } else if attr_bool(&e, "customHeight", false) {
                        if let Some(points) = attr_f64(&e, "ht") {
                            data.row_heights.push((row, row_height_to_px(points)));
                        }
                    }
                }
                b"c" => {
                    let (r, c) = attr(&e, "r").as_deref().and_then(parse_cell).unwrap_or((row, next_col));
                    next_col = c + 1;
                    let pending = PendingCell {
                        row: r, col: c, style: attr_u32(&e, "s").unwrap_or(0),
                        kind: attr(&e, "t").unwrap_or_default(), ..Default::default()
                    };
                    if empty {
                        data.cells.push(finish(pending, strings, &mut shared, &mut arrays));
                    } else {
                        cell = Some(pending);
                    }
                }
                b"col" => column_entries(&e, &mut data),
                b"mergeCell" => {
                    if let Some(range) = attr(&e, "ref").as_deref().and_then(parse_range) {
                        if range[0] != range[2] || range[1] != range[3] { data.merges.push(range) }
                    }
                }
                b"pane" => {
                    let frozen = matches!(attr(&e, "state").as_deref(), Some("frozen" | "frozenSplit"));
                    let rows = attr_f64(&e, "ySplit").unwrap_or(0.0) as u32;
                    let cols = attr_f64(&e, "xSplit").unwrap_or(0.0) as u32;
                    if frozen && (rows > 0 || cols > 0) { data.freeze = Some((rows, cols)) }
                }
                _ => {}
            },
            Event::Start(e) => {
                let pending = cell.as_mut().expect("inside <c>");
                match local_name(&e).as_slice() {
                    b"v" => text = Text::Value,
                    b"t" => text = if phonetic == 0 { Text::Inline } else { Text::None },
                    b"rPr" => pending.rich = true,
                    b"rPh" => phonetic += 1,
                    b"f" => {
                        pending.formula = Some(String::new());
                        match attr(&e, "t").as_deref() {
                            Some("shared") => pending.shared = attr(&e, "si"),
                            Some("array") => pending.array_ref = attr(&e, "ref"),
                            _ => {}
                        }
                        text = Text::Formula;
                    }
                    _ => {}
                }
            }
            Event::Empty(e) => {
                let pending = cell.as_mut().expect("inside <c>");
                match local_name(&e).as_slice() {
                    b"f" if attr(&e, "t").as_deref() == Some("shared") => pending.shared = attr(&e, "si"),
                    b"rPr" => pending.rich = true,
                    _ => {}
                }
            }
            ref piece @ (Event::Text(_) | Event::CData(_) | Event::GeneralRef(_)) => {
                if let (Some(pending), Some(t)) = (cell.as_mut(), text_of(piece)) {
                    match text {
                        Text::Value => pending.value.push_str(&t),
                        Text::Inline => pending.inline.push_str(&t),
                        Text::Formula => pending.formula.get_or_insert_with(String::new).push_str(&t),
                        Text::None => {}
                    }
                }
            }
            Event::End(e) => match e.local_name().as_ref() {
                b"c" => {
                    if let Some(pending) = cell.take() {
                        if pending.rich {
                            data.rich_text += 1;
                        }
                        data.cells.push(finish(pending, strings, &mut shared, &mut arrays));
                    }
                    phonetic = 0;
                }
                b"v" | b"t" | b"f" => text = Text::None,
                b"rPh" => phonetic = phonetic.saturating_sub(1),
                _ => {}
            },
            Event::Eof => break,
            _ => {}
        }
    }
    drop_array_results(&mut data.cells, &arrays);
    Ok(data)
}

/// 数组公式（含动态数组）只有锚点是公式，其余格是缓存结果；写成字面值会挡住溢出。
fn drop_array_results(cells: &mut [RawCell], arrays: &[[u32; 4]]) {
    for cell in cells.iter_mut() {
        let inside = arrays.iter().any(|[r1, c1, r2, c2]| {
            (*r1..=*r2).contains(&cell.row) && (*c1..=*c2).contains(&cell.col) &&
                (cell.row, cell.col) != (*r1, *c1)
        });
        if inside && !matches!(cell.content, Some(("formula", _))) {
            cell.content = None;
        }
    }
}

