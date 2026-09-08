//! 一次替换先冻结匹配计划，再复用原生历史提交；错误时在同一 batch 内回滚。
use super::*;
use crate::find_text::utf16_span;
use crate::{FindLookIn, FindMatch, FindQuery};

#[derive(Debug, Default, PartialEq, Eq)]
pub struct ReplaceReport {
    pub cells: usize,
    pub occurrences: usize,
}

impl WorkbookHistory {
    /// `current = None` 替换全部命中；Some 只替换当前原生匹配位置。
    /// 搜索分页从不参与写入范围，替换文字也不在本次命令中递归搜索。
    pub fn replace_by_query(
        &mut self,
        workbook: &mut Workbook,
        targets: &[(usize, CellRange)],
        query: &FindQuery,
        replacement: &str,
        current: Option<&FindMatch>,
    ) -> Result<ReplaceReport, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another mutation is in progress.");
        }
        if replacement.len() > 1_048_576 {
            return Err("Replacement text is too large.");
        }
        let mut writes = Vec::new();
        let mut report = ReplaceReport::default();
        let mut error = None;
        let mut found_current = false;
        let mut retained_bytes = 0usize;
        workbook.for_each_find_cell(targets, query, |cell| {
            if error.is_some() {
                return;
            }
            if current.is_some_and(|m| m.sheet != cell.sheet || m.address != cell.address) {
                return;
            }
            let spans: Vec<_> = cell
                .spans
                .iter()
                .filter(|span| {
                    current.is_none_or(|m| {
                        let position = utf16_span(&cell.text, span);
                        position.start == m.start && position.end == m.end
                    })
                })
                .collect();
            if spans.is_empty() {
                return;
            }
            found_current = true;
            let source = workbook.sheet(cell.sheet).unwrap();
            if source
                .spill_anchor_for(cell.address)
                .is_some_and(|anchor| anchor != cell.address)
            {
                error = Some("Cannot replace a spill result. Edit its formula instead.");
                return;
            }
            // 值查找可以定位公式结果，但不能把计算结果静默改成常量。
            if cell.formula && query.look_in == FindLookIn::Values {
                error = Some("Choose Formulas to replace formula cells.");
                return;
            }
            // 在分配前限制扩张；超限整次拒绝，绝不把部分替换说成“全部”。
            let removed: usize = spans.iter().map(|span| span.len()).sum();
            let expanded = replacement
                .len()
                .checked_mul(spans.len())
                .and_then(|bytes| bytes.checked_add(cell.text.len() - removed));
            let Some(expanded) = expanded.filter(|bytes| *bytes <= 16 * 1024 * 1024) else {
                error = Some("A replacement cell would exceed 16 MiB.");
                return;
            };
            if retained_bytes.saturating_add(expanded) > 32 * 1024 * 1024 || writes.len() >= 100_000
            {
                error = Some(
                    "Replace exceeds 100,000 changed cells or 32 MiB. Choose a smaller range.",
                );
                return;
            }
            let mut result = String::with_capacity(expanded);
            let mut previous = 0;
            for span in &spans {
                result.push_str(&cell.text[previous..span.start]);
                result.push_str(replacement);
                previous = span.end;
            }
            result.push_str(&cell.text[previous..]);
            if result == cell.text {
                return;
            }
            // 与普通编辑共用类型解析；原文字格保持文字，避免 00123 或 =... 被误识别。
            if !cell.formula
                && !result.is_empty()
                && matches!(
                    source.peek_value(cell.address),
                    einfach_core::Value::Text(_)
                )
            {
                result.insert(0, '\'');
            }
            report.cells += 1;
            report.occurrences += spans.len();
            retained_bytes += result.len();
            writes.push((cell.sheet, cell.address, result));
        })?;
        if let Some(error) = error {
            return Err(error);
        }
        if current.is_some() && !found_current {
            return Err("The current match has changed. Find again.");
        }
        if writes.is_empty() {
            return Ok(report);
        }
        // 只保存实际改变的格子；不复制匹配范围内的大量未修改内容。
        let history_targets: Vec<_> = writes
            .iter()
            .map(|(sheet, addr, _)| (*sheet, CellRange::single(*addr), true))
            .collect();
        let (sheet, range, _) = history_targets[0];
        self.begin_ranges(workbook, sheet, range, "Replace", &history_targets, false)?;
        let store = workbook.store.clone();
        let mut outcome = Ok(());
        store.batch(|_| {
            outcome = writes.iter().try_for_each(|(sheet, addr, input)| {
                workbook.set_cell_input(*sheet, &addr.to_string(), input)
            });
            let restored = self.finish(workbook, outcome.is_ok());
            if let Err(error) = restored {
                outcome = Err(error);
            }
        });
        outcome?;
        Ok(report)
    }
}
