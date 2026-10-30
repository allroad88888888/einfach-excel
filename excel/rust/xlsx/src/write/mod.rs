//! 原生工作簿文件 → XLSX 字节。

mod package;
mod styles;
mod worksheet;
mod xml;

use std::io::{Cursor, Write};

use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipWriter};

use crate::address::parse_cell;
use crate::native::NativeFile;
use crate::XlsxError;

pub fn write(file: &NativeFile) -> Result<Vec<u8>, XlsxError> {
    let workbook = &file.workbook;
    let mut sheets: Vec<worksheet::SheetInput> = workbook.sheets.iter().map(|_| Default::default()).collect();
    let mut styles = styles::StyleTable::new();

    for cell in &workbook.cells {
        if let Some(target) = sheets.get_mut(cell.sheet) {
            target.cells.push(cell);
        }
    }
    for range in &workbook.formats {
        let Some(target) = range.sheet.and_then(|index| sheets.get_mut(index as usize)) else { continue };
        for style in &range.cell_styles {
            if let Some(coord) = parse_cell(&style.addr) {
                let xf = styles.xf(&style.format);
                if xf != 0 {
                    target.styles.insert(coord, xf);
                }
            }
        }
    }
    for range in &workbook.sizes {
        let Some(target) = range.sheet.and_then(|index| sheets.get_mut(index as usize)) else { continue };
        target.row_heights.extend(range.row_heights.iter().map(|h| (h.row_index, h.height_px)));
        target.col_widths.extend(range.col_widths.iter().map(|w| (w.col_index, w.width_px)));
    }
    for merges in &workbook.merges {
        if let Some(target) = sheets.get_mut(merges.sheet) {
            target.merges.extend(merges.ranges.iter().copied());
        }
    }
    for freeze in &workbook.freeze {
        if let Some(target) = sheets.get_mut(freeze.sheet) {
            target.freeze = Some((freeze.rows, freeze.cols));
        }
    }

    let mut strings = worksheet::SharedStrings::default();
    let sheet_xml: Vec<String> = sheets.iter().map(|sheet| worksheet::write(sheet, &mut strings)).collect();
    let names: Vec<String> = workbook.sheets.iter().map(|sheet| sheet.name.clone()).collect();

    let mut zip = ZipWriter::new(Cursor::new(Vec::new()));
    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut put = |path: &str, body: &str| -> Result<(), XlsxError> {
        zip.start_file(path, options).map_err(|e| XlsxError::new(e.to_string()))?;
        zip.write_all(body.as_bytes()).map_err(|e| XlsxError::new(e.to_string()))
    };
    put("[Content_Types].xml", &package::content_types(names.len()))?;
    put("_rels/.rels", &package::root_rels())?;
    put("xl/workbook.xml", &package::workbook(&names))?;
    put("xl/_rels/workbook.xml.rels", &package::workbook_rels(names.len()))?;
    for (index, xml) in sheet_xml.iter().enumerate() {
        put(&format!("xl/worksheets/sheet{}.xml", index + 1), xml)?;
    }
    put("xl/styles.xml", &styles.into_xml())?;
    put("xl/sharedStrings.xml", &package::shared_strings(&strings.items))?;
    let cursor = zip.finish().map_err(|e| XlsxError::new(e.to_string()))?;
    Ok(cursor.into_inner())
}
