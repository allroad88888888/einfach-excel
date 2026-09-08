//! Rust 持有的剪贴板快照：复制时冻结值/公式/有效样式，不复制行高列宽。

use crate::{CellAddress, CellFormat, CellRange, Workbook};
use einfach_core::Value;

#[path = "clipboard_move.rs"]
mod move_refs;
#[path = "clipboard_paste.rs"]
mod paste;
#[path = "clipboard_paste_target.rs"]
mod paste_target;
pub use paste_target::{ClipboardPasteMode, ClipboardPasteOptions};
#[path = "clipboard_tsv.rs"]
mod tsv;

pub const MAX_CLIPBOARD_CELLS: u64 = 1_048_576;
pub const MAX_CLIPBOARD_TEXT_BYTES: usize = 16 * 1024 * 1024;
pub type ClipboardError = &'static str;

#[derive(Clone, Debug, PartialEq)]
enum ClipboardValue {
    Formula {
        source: String,
        evaluated: Option<Value>,
    },
    Literal(Value),
}

#[derive(Clone, Debug, PartialEq)]
struct ClipboardCell {
    value: ClipboardValue,
    // 外部纯文本粘贴不覆盖目标格式；内部复制有完整有效格式。
    format: Option<CellFormat>,
}

impl ClipboardCell {
    /// 只跳过真正的空格；零、false、空字符串及返回空字符串的公式都是有意写入的内容。
    fn is_blank(&self) -> bool {
        matches!(self.value, ClipboardValue::Literal(Value::Null))
    }
}

#[derive(Clone, Debug)]
pub struct ClipboardSnapshot {
    source_sheet: Option<usize>,
    source: CellRange,
    cut: bool,
    cells: Vec<ClipboardCell>,
    text: String,
}

impl ClipboardSnapshot {
    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn is_cut(&self) -> bool {
        self.cut
    }

    pub fn rows(&self) -> u32 {
        self.source.rows()
    }

    pub fn cols(&self) -> u32 {
        self.source.cols()
    }
}

/// 在分配/遍历之前校验几何，避免整表复制导致 Worker 内存耗尽。
fn validate_range(range: CellRange) -> Result<(), ClipboardError> {
    if range.start.row > range.end.row
        || range.start.col > range.end.col
        || range.end.row >= crate::sheet::EXCEL_MAX_ROWS
        || range.end.col >= crate::sheet::EXCEL_MAX_COLS
    {
        return Err("CLIPBOARD_INVALID_RANGE");
    }
    if u64::from(range.rows()) * u64::from(range.cols()) > MAX_CLIPBOARD_CELLS {
        return Err("CLIPBOARD_TOO_LARGE");
    }
    Ok(())
}

fn read_cell(sheet: &crate::Sheet, addr: CellAddress) -> ClipboardCell {
    ClipboardCell {
        value: match sheet.formula_text_at(addr) {
            Some(source) => ClipboardValue::Formula {
                source,
                // 仅粘贴值使用复制时的原始结果，不能解析带舍入/货币符号的显示文本。
                evaluated: Some(crate::sheet::collapse_array_for_eval(
                    sheet.peek_value(addr),
                )),
            },
            None => ClipboardValue::Literal(sheet.peek_value(addr)),
        },
        format: Some(sheet.effective_format(&addr.to_string_repr())),
    }
}

impl Workbook {
    /// 剪切也只读取。删除源格属于之后的粘贴事务。
    pub fn capture_clipboard(
        &self,
        sheet_idx: usize,
        range: CellRange,
        cut: bool,
    ) -> Result<ClipboardSnapshot, ClipboardError> {
        validate_range(range)?;
        let sheet = self.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let mut cells = Vec::with_capacity(range.cell_count() as usize);
        let mut text = String::new();
        for addr in range.iter() {
            if cut && sheet.is_spill_region(addr) {
                return Err("CLIPBOARD_SPILL_SOURCE");
            }
            if addr != range.start {
                text.push(if addr.col == range.start.col {
                    '\n'
                } else {
                    '\t'
                });
            }
            tsv::push_field(&mut text, &sheet.formatted_display(&addr.to_string_repr()));
            if text.len() > MAX_CLIPBOARD_TEXT_BYTES {
                return Err("CLIPBOARD_TOO_LARGE");
            }
            cells.push(read_cell(sheet, addr));
        }
        Ok(ClipboardSnapshot {
            source_sheet: Some(sheet_idx),
            source: range,
            cut,
            cells,
            text,
        })
    }
}

#[cfg(test)]
#[path = "clipboard_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "clipboard_paste_modes_tests.rs"]
mod paste_modes_tests;

#[cfg(test)]
#[path = "clipboard_transpose_tests.rs"]
mod transpose_tests;

#[cfg(test)]
#[path = "clipboard_skip_blanks_tests.rs"]
mod skip_blanks_tests;

#[cfg(test)]
#[path = "clipboard_formula_modes_tests.rs"]
mod formula_modes_tests;
