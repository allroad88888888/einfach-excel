//! 快捷公式只提出草稿：原生数据决定范围，确认仍走普通单格编辑事务。
use crate::{CellAddress, CellRange, Sheet, Workbook};
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use einfach_core::Value;

#[derive(Clone, Copy, Debug)]
pub enum QuickFormula { Sum, Average, Count }

#[derive(Debug, PartialEq, Eq)]
pub struct QuickFormulaSuggestion {
    pub source: CellRange,
    pub target: CellAddress,
    pub input: String,
}

impl Workbook {
    pub fn suggest_quick_formula(&self, sheet: usize, selected: CellRange,
        row_count: u32, col_count: u32, function: QuickFormula,
    ) -> Result<QuickFormulaSuggestion, &'static str> {
        let result = (|| {
            if row_count == 0 || row_count > EXCEL_MAX_ROWS || col_count == 0
                || col_count > EXCEL_MAX_COLS || selected != selected.normalize()
                || selected.end.row >= row_count || selected.end.col >= col_count {
                return Err("Select cells inside the worksheet canvas.");
            }
            if selected.rows() as u64 * selected.cols() as u64 > 100_000 {
                return Err("Choose at most 100,000 source cells.");
            }
            let sheet = self.sheet(sheet).ok_or("Worksheet no longer exists.")?;
            if sheet.merged_ranges().iter().any(|range| range.intersects(selected)) {
                return Err("Choose unmerged source cells for a quick formula.");
            }
            let (source, target) = propose(sheet, selected)?;
            if target.row >= row_count || target.col >= col_count {
                return Err("There is no room for a result cell. Select an empty result cell instead.");
            }
            if sheet.hidden_row_set().contains(&target.row)
                || sheet.filter_hidden_set().is_some_and(|rows| rows.contains(&target.row))
                || sheet.hidden_columns().contains(&target.col)
                || sheet.outline().is_hidden(crate::outline::OutlineAxis::Row, target.row)
                || sheet.outline().is_hidden(crate::outline::OutlineAxis::Column, target.col) {
                return Err("Unhide the result cell before inserting a quick formula.");
            }
            // 格式不算内容；空字符串和返回空值的公式仍是内容，不能自动覆盖。
            if !blank(sheet, target) {
                return Err("The result cell is not empty. Select an empty result cell instead.");
            }
            if sheet.merged_ranges().iter().any(|range| range.intersects(source)
                || range.contains(target)) || sheet.spill_intersecting(CellRange::single(target)).is_some() {
                return Err("The source or result intersects merged cells or a spilled result.");
            }
            let name = match function {
                QuickFormula::Sum => "SUM", QuickFormula::Average => "AVERAGE", QuickFormula::Count => "COUNT",
            };
            Ok(QuickFormulaSuggestion { source, target,
                input: format!("={name}({}:{})", source.start, source.end) })
        })();
        // 包括拒绝路径在内，都结算本次只读推断产生的惰性公式读取。
        self.store.settle_pending_reads();
        result
    }
}

fn blank(sheet: &Sheet, cell: CellAddress) -> bool {
    !sheet.has_formula_at(cell) && matches!(sheet.peek_value(cell), Value::Null)
}

fn propose(sheet: &Sheet, range: CellRange) -> Result<(CellRange, CellAddress), &'static str> {
    if range.start == range.end && blank(sheet, range.start) {
        // 空结果格优先查紧邻上方，找不到数值再查左方；不跨越文本或空白猜远处数据。
        for vertical in [true, false] {
            if let Some(source) = adjacent_numbers(sheet, range.start, vertical)? {
                return Ok((source, range.start));
            }
        }
        return Err("Select data, or an empty cell immediately below or right of numbers.");
    }
    if range.rows() == 1 && range.cols() > 1 {
        if blank(sheet, range.end) {
            return Ok((CellRange::new(range.start, CellAddress::new(range.end.row, range.end.col - 1)), range.end));
        }
        return Ok((range, CellAddress::new(range.end.row, range.end.col + 1)));
    }
    // 选区产生一个汇总公式。末行全空时将其作为结果行，否则使用选区下一行。
    if range.rows() > 1 && (range.start.col..=range.end.col)
        .all(|col| blank(sheet, CellAddress::new(range.end.row, col))) {
        return Ok((CellRange::new(range.start, CellAddress::new(range.end.row - 1, range.end.col)),
            CellAddress::new(range.end.row, range.start.col)));
    }
    Ok((range, CellAddress::new(range.end.row + 1, range.start.col)))
}

fn adjacent_numbers(sheet: &Sheet, target: CellAddress, vertical: bool)
    -> Result<Option<CellRange>, &'static str> {
    let end = if vertical { target.row } else { target.col };
    let coord = |index| if vertical { CellAddress::new(index, target.col) }
        else { CellAddress::new(target.row, index) };
    let mut start = end;
    for index in (0..end).rev() {
        let value = sheet.peek_value(coord(index));
        let scalar = match &value { Value::Array(array) => array.get(0, 0), _ => Some(&value) };
        if !matches!(scalar, Some(Value::Number(value)) if value.is_finite()) { break }
        if end - index > 100_000 { return Err("Choose an explicit source range of at most 100,000 cells."); }
        start = index;
    }
    Ok((start < end).then(|| CellRange::new(coord(start), coord(end - 1))))
}
