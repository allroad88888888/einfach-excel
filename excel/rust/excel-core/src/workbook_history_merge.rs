//! 合并及居中是一条原生历史；取消合并也记录，但不把清掉的内容当作隐藏数据保留。
use super::*;
use crate::MergeAction;

#[derive(Debug)]
pub(super) struct MergeChange {
    range: CellRange,
    before: HistorySnapshot,
    after: HistorySnapshot,
    before_merges: Vec<CellRange>,
    after_merges: Vec<CellRange>,
}

impl MergeChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let snapshot = if undo { &self.before } else { &self.after };
        let merges = if undo {
            &self.before_merges
        } else {
            &self.after_merges
        };
        let observers = workbook.sheets[sheet].suspend_structure_notifications();
        let store = workbook.store.clone();
        store.batch(|_| {
            let target = &mut workbook.sheets[sheet];
            let anchors = target.restore_structure_content(&[snapshot]);
            target.replace_merges_in_range(self.range, merges);
            target.project_bulk_spill_anchors(anchors);
        });
        workbook.sheets[sheet].resume_structure_notifications(observers);
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        self.before.retained_bytes()
            + self.after.retained_bytes()
            + (self.before_merges.len() + self.after_merges.len())
                * std::mem::size_of::<CellRange>()
    }
}

impl WorkbookHistory {
    pub fn merge_cells(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        range: CellRange,
        action: MergeAction,
        discard: bool,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() {
            return Err("Another history command is pending.");
        }
        validate_target(workbook, sheet, range)?;
        workbook.validate_merge(sheet, range, action, discard)?;
        // 点击一个被覆盖的格取消合并时，历史范围仍覆盖整个原合并矩形。
        let before_merges = workbook.sheets[sheet].merges_in_range(range);
        let mut affected = range;
        for r in &before_merges {
            affected.start.row = affected.start.row.min(r.start.row);
            affected.start.col = affected.start.col.min(r.start.col);
            affected.end.row = affected.end.row.max(r.end.row);
            affected.end.col = affected.end.col.max(r.end.col);
        }
        let before = HistorySnapshot::capture(&workbook.sheets[sheet], affected, true);
        if !workbook.merge_cells(sheet, range, action, discard)? {
            return Ok(false);
        }
        let change = MergeChange {
            range,
            before,
            before_merges,
            after: HistorySnapshot::capture(&workbook.sheets[sheet], affected, true),
            after_merges: workbook.sheets[sheet].merges_in_range(range),
        };
        let key = workbook.sheet_key(sheet).unwrap();
        self.push(HistoryEntry {
            label: match action {
                MergeAction::Merge => "Merge cells",
                MergeAction::Center => "Merge and center",
                MergeAction::Unmerge => "Unmerge cells",
            }
            .into(),
            sheet,
            range: affected,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_indices: vec![sheet],
            affected_keys: vec![key],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Merge(Box::new(change)),
        });
        Ok(true)
    }
}
