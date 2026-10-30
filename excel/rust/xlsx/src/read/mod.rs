//! XLSX 字节 → 原生工作簿文件。

mod archive;
mod shared_strings;
mod styles;
mod theme;
mod worksheet;
mod xml;

use crate::address::cell_name;
use crate::native::*;
use crate::XlsxError;

/// 引擎表名规则：1–31 字符、不含 `[]:*?/\`；重名或空名改成 SheetN。
fn sheet_name(name: &str, index: usize, used: &mut Vec<String>) -> String {
    let cleaned: String = name.chars().filter(|c| !"[]:*?/\\".contains(*c)).take(31).collect();
    let mut candidate = if cleaned.trim().is_empty() { format!("Sheet{}", index + 1) } else { cleaned };
    let mut suffix = 2;
    while used.iter().any(|n| n.eq_ignore_ascii_case(&candidate)) {
        candidate = format!("Sheet{}_{suffix}", index + 1);
        suffix += 1;
    }
    used.push(candidate.clone());
    candidate
}

pub fn read(bytes: Vec<u8>, title: &str) -> Result<NativeFile, XlsxError> {
    let mut archive = archive::Archive::open(bytes)?;
    let parts = archive.workbook_parts()?;
    if parts.date1904 {
        return Err(XlsxError::new("Workbooks using the 1904 date system are not supported yet."));
    }
    let strings = match &parts.shared_strings {
        Some(path) => shared_strings::parse(&archive.read(path)?.unwrap_or_default())?,
        None => Vec::new(),
    };
    let theme_xml = match &parts.theme { Some(path) => archive.read(path)?, None => None };
    let theme = theme::parse(theme_xml.as_deref());
    let styles_xml = match &parts.styles { Some(path) => archive.read(path)?, None => None };
    let xfs = styles::parse(styles_xml.as_deref(), &theme)?;

    let mut workbook = Persistence { version: 1, ..Default::default() };
    let mut canvases = Vec::new();
    let mut used = Vec::new();
    for (index, part) in parts.sheets.iter().enumerate() {
        let xml = archive.read(&part.path)?
            .ok_or_else(|| XlsxError::new(format!("Worksheet {} is missing from the file.", part.name)))?;
        let data = worksheet::parse(&xml, &strings)?;
        workbook.sheets.push(SheetMeta { idx: index as u32, name: sheet_name(&part.name, index, &mut used) });
        canvases.push(Canvas { row_count: MAX_ROWS, col_count: MAX_COLS });

        let mut cell_styles = Vec::new();
        for cell in data.cells {
            let addr = cell_name(cell.row, cell.col);
            if let Some(format) = xfs.get(cell.style as usize).filter(|f| **f != CellFormat::default()) {
                cell_styles.push(CellStyle { addr: addr.clone(), format: format.clone() });
            }
            if let Some((kind, value)) = cell.content {
                workbook.cells.push(SparseCell {
                    sheet: index, addr, row: cell.row, col: cell.col, kind: kind.into(), value: Some(value),
                });
            }
        }
        if !cell_styles.is_empty() {
            workbook.formats.push(FormatRange {
                sheet: Some(index as u32), start_row: 0, start_col: 0, end_row: u32::MAX, end_col: u32::MAX,
                cell_styles, ..Default::default()
            });
        }
        if !data.row_heights.is_empty() || !data.col_widths.is_empty() {
            workbook.sizes.push(SizeRange {
                sheet: Some(index as u32), start_row: 0, start_col: 0, end_row: u32::MAX, end_col: u32::MAX,
                row_heights: data.row_heights.into_iter()
                    .map(|(row_index, height_px)| RowHeight { row_index, height_px }).collect(),
                col_widths: data.col_widths.into_iter()
                    .map(|(col_index, width_px)| ColWidth { col_index, width_px }).collect(),
            });
        }
        if !data.merges.is_empty() {
            workbook.merges.push(SheetMerges { sheet: index, ranges: data.merges });
        }
        if let Some((rows, cols)) = data.freeze {
            workbook.freeze.push(SheetFreeze { sheet: index, rows, cols });
        }
    }
    Ok(NativeFile { format: FORMAT.into(), version: 1, title: title.into(), canvases, workbook })
}
