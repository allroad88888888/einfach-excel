//! Rust 持有的剪贴板快照：冻结值/公式/有效样式/列宽；只有列宽模式写尺寸，不复制行高。

use crate::{CellAddress, CellFormat, CellRange, Workbook};
use einfach_core::Value;

#[path = "clipboard_arithmetic.rs"]
mod arithmetic;
#[path = "clipboard_move.rs"]
mod move_refs;
#[path = "clipboard_paste.rs"]
mod paste;
#[path = "clipboard_paste_target.rs"]
mod paste_target;
pub use arithmetic::ClipboardArithmetic;
#[path = "clipboard_apply.rs"]
mod apply;
#[path = "clipboard_column_widths.rs"]
mod column_widths;
#[path = "clipboard_history_targets.rs"]
mod history_targets;
#[path = "clipboard_merge.rs"]
mod merge;
#[path = "clipboard_paste_values.rs"]
mod paste_values;
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
    // None 表示外部 TSV：cells 中只保存原始 Text / 空白 Null，粘贴预检才解析。
    source_sheet: Option<usize>,
    source: CellRange,
    // 压紧后的每一行仍记住真实源行；相对公式不能按压紧坐标偏移。
    source_rows: Vec<u32>,
    cut: bool,
    cells: Vec<ClipboardCell>,
    text: String,
    // 仅列宽粘贴使用复制时的列属性；None 表示默认宽度，不是漏读。
    column_widths: Vec<Option<u32>>,
    // 原生快照保留复制时的矩形，之后取消源合并也不改变剪贴板。
    merges: Vec<CellRange>,
}

impl ClipboardSnapshot {
    /// 表重排只改变源表索引；源表被删除时由宿主释放快照，避免误剪另一张表。
    pub fn remap_source_sheet(&mut self, map: impl FnOnce(usize) -> Option<usize>) -> bool {
        let Some(source) = self.source_sheet else {
            return true;
        };
        let Some(next) = map(source) else {
            return false;
        };
        self.source_sheet = Some(next);
        true
    }

    /// 跟随表名变化或删除；冻结结果和样式不变，静态公式身份保持一致。
    pub fn rewrite_sheet_references(&mut self, old: &str, new: Option<&str>) {
        for cell in &mut self.cells {
            if let ClipboardValue::Formula { source, .. } = &mut cell.value {
                if let Some(mut expr) = crate::parse_formula(source) {
                    let original = expr.clone();
                    crate::workbook::rewrite_sheet_refs(&mut expr, old, new);
                    if expr != original {
                        *source = crate::render_formula(&expr);
                    }
                }
            }
        }
    }

    pub fn text(&self) -> &str {
        &self.text
    }

    pub fn is_cut(&self) -> bool {
        self.cut
    }

    pub fn rows(&self) -> u32 {
        self.source_rows.len() as u32
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
        let hidden = sheet.filter_hidden_set();
        let source_rows: Vec<u32> = (range.start.row..=range.end.row)
            .filter(|row| !hidden.is_some_and(|rows| rows.contains(row)))
            .collect();
        if cut && source_rows.len() != range.rows() as usize {
            return Err("CLIPBOARD_FILTERED_CUT");
        }
        if source_rows.is_empty() {
            return Err("CLIPBOARD_NO_VISIBLE_ROWS");
        }
        let merges: Vec<_> = sheet.merges_in_range(range).into_iter().filter(|merge| {
            source_rows.get(source_rows.partition_point(|row| *row < merge.start.row))
                .is_some_and(|row| *row <= merge.end.row)
        }).collect();
        if merges
            .iter()
            .any(|merge| !range.contains(merge.start) || !range.contains(merge.end)
                || (merge.start.row..=merge.end.row)
                    .any(|row| hidden.is_some_and(|rows| rows.contains(&row))))
        {
            return Err("CLIPBOARD_PARTIAL_MERGE");
        }
        let mut cells = Vec::with_capacity(source_rows.len() * range.cols() as usize);
        let mut text = String::new();
        for addr in source_rows.iter().flat_map(|row| {
            (range.start.col..=range.end.col).map(move |col| CellAddress::new(*row, col))
        }) {
            if cut && sheet.is_spill_region(addr) {
                return Err("CLIPBOARD_SPILL_SOURCE");
            }
            if !cells.is_empty() {
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
            source_rows,
            cut,
            cells,
            text,
            column_widths: (range.start.col..=range.end.col)
                .map(|col| sheet.col_width(col))
                .collect(),
            merges,
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
