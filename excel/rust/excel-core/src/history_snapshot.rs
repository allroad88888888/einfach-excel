//! 历史只保存被当前命令覆盖的原始值、公式源与稀疏格式，不保存计算结果。
use crate::{CellRange, CellSnapshot, FormatRangeSnapshot, Sheet, Workbook};
use einfach_core::Value;

#[derive(Clone, Debug, PartialEq)]
pub struct HistorySnapshot {
    pub range: CellRange,
    pub cells: Option<Vec<CellSnapshot>>,
    pub formats: FormatRangeSnapshot,
    pub column_widths: Vec<(u32, u32)>,
    pub(crate) merges: Option<Vec<CellRange>>,
}

impl HistorySnapshot {
    pub fn capture(sheet: &Sheet, range: CellRange, content: bool) -> Self {
        let cells = content.then(|| {
            let mut cells = Vec::new();
            let mut capture = |addr| {
                // spill 子格由锚点公式重新生成，不能把计算结果变成字面量保存。
                if sheet
                    .spill_anchor_for(addr)
                    .is_some_and(|anchor| anchor != addr)
                {
                    return;
                }
                if let Some(formula) = sheet.formula_text_at(addr) {
                    cells.push(CellSnapshot::formula(addr, formula));
                } else {
                    let value = sheet.peek_value(addr);
                    if value != Value::Null {
                        cells.push(CellSnapshot::value(addr, value));
                    }
                }
            };
            if range.start == range.end {
                capture(range.start);
            } else {
                sheet.for_each_non_empty_in_range(range, &mut capture);
            }
            cells.sort_by_key(|cell| (cell.addr.row, cell.addr.col));
            cells
        });
        Self {
            range,
            cells,
            formats: sheet.snapshot_format_range(range),
            column_widths: sheet.col_widths_in_range(range.start.col, range.end.col),
            merges: None,
        }
    }

    /// 只有会改变合并几何的命令才携带它，普通输入/格式历史仍只记录原有字段。
    pub(crate) fn capture_with_merges(
        sheet: &Sheet,
        range: CellRange,
        content: bool,
        merges: bool,
    ) -> Self {
        let mut snapshot = Self::capture(sheet, range, content);
        snapshot.merges = merges.then(|| sheet.merges_in_range(range));
        snapshot
    }

    /// 一次 Store batch 内恢复源数据，随后还原写入自动改变的行高/格式。
    pub fn restore(&self, workbook: &mut Workbook, sheet: usize) -> Result<(), &'static str> {
        if workbook.sheet(sheet).is_none() {
            return Err("History worksheet no longer exists.");
        }
        workbook.restore_history_snapshot(sheet, self)
    }

    /// 历史预算按原始字符串及稀疏条目估算，避免大量长文本记录无限增长。
    pub fn retained_bytes(&self) -> usize {
        let cells = self.cells.as_ref().map_or(0, |cells| {
            cells
                .iter()
                .map(|cell| {
                    64 + cell.formula.as_ref().map_or(0, String::len)
                        + match &cell.value {
                            Some(Value::Text(text)) => text.len(),
                            _ => 32,
                        }
                })
                .sum()
        });
        cells
            + (self.formats.cell_styles.len()
                + self.formats.row_styles.len()
                + self.formats.column_styles.len())
                * 512
            + self.column_widths.len() * 16
            + self
                .merges
                .as_ref()
                .map_or(0, |ranges| ranges.len() * std::mem::size_of::<CellRange>())
    }
}
