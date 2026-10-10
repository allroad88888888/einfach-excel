//! 条件格式仅覆盖返回的显示快照；持久基础样式与格式刷快照保持原样。
use super::conditional_format_numeric::NumericRule;
use super::*;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::FormatRangeSnapshot;

impl Workbook {
    pub fn snapshot_display_format_range(
        &self,
        sheet: usize,
        range: CellRange,
    ) -> Result<FormatRangeSnapshot, &'static str> {
        let range = range.normalize();
        if range.end.row >= EXCEL_MAX_ROWS
            || range.end.col >= EXCEL_MAX_COLS
            || u64::from(range.rows()) * u64::from(range.cols()) > 100_000
        {
            return Err("Display formatting reads are limited to a valid 100,000-cell window.");
        }
        let target = self.sheet(sheet).ok_or("The worksheet no longer exists.")?;
        let mut snapshot = target.snapshot_format_range(range);
        let mut rules: Vec<_> = self.conditional_formats[sheet]
            .rules
            .iter()
            .filter(|entry| {
                entry.row_start <= range.end.row
                    && entry.row_end >= range.start.row
                    && entry.col_start <= range.end.col
                    && entry.col_end >= range.start.col
            })
            // 旧持久化允许不透明规则。未实现的种类保留原文，不交给 TS 猜着求值。
            .filter_map(|entry| {
                NumericRule::parse(&entry.rule_json)
                    .ok()
                    .map(|rule| (entry, rule))
            })
            .collect();
        if rules.is_empty() {
            return Ok(snapshot);
        }
        // 数字较小的优先级更高；同优先级时，列表中较前的规则优先。
        rules.sort_by_key(|(entry, _)| entry.priority);
        let mut styles: BTreeMap<_, _> = snapshot
            .cell_styles
            .into_iter()
            .map(|(addr, style)| ((addr.row, addr.col), style))
            .collect();
        for row in range.start.row..=range.end.row {
            for col in range.start.col..=range.end.col {
                if !rules.iter().any(|(entry, _)| entry.contains(row, col)) {
                    continue;
                }
                let value = target.peek_value(CellAddress::new(row, col));
                let scalar = match &value {
                    Value::Array(array) => array.get(0, 0),
                    _ => Some(&value),
                };
                let Some(Value::Number(number)) = scalar else {
                    continue;
                };
                for (entry, rule) in rules.iter().rev() {
                    if entry.contains(row, col) && rule.matches(*number) {
                        styles
                            .entry((row, col))
                            .or_default()
                            .apply_patch(&rule.style);
                    }
                }
            }
        }
        self.store.settle_pending_reads();
        snapshot.cell_styles = styles
            .into_iter()
            .map(|((row, col), style)| (CellAddress::new(row, col), style))
            .collect();
        Ok(snapshot)
    }
}

impl ConditionalFormatRuleEntry {
    fn contains(&self, row: u32, col: u32) -> bool {
        row >= self.row_start && row <= self.row_end && col >= self.col_start && col <= self.col_end
    }
}
