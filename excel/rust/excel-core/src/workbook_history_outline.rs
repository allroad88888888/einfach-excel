//! 大纲历史只保存分组元数据；取消折叠组时保留其隐藏行列。
use super::*;
use crate::outline::{OutlineAction, OutlineAxis, SheetOutline};
use crate::workbook::SheetVisibility;
use crate::CellAddress;
use std::collections::BTreeSet;

#[derive(Debug)]
struct OutlineState {
    outline: SheetOutline,
    visibility: SheetVisibility,
}

#[derive(Debug)]
pub(super) struct OutlineChange {
    before: OutlineState,
    after: OutlineState,
}

impl OutlineChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() || workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        let expected = if undo { &self.after } else { &self.before };
        if workbook.sheet(sheet).unwrap().outline() != &expected.outline
            || workbook.sheet_visibility(sheet)? != expected.visibility
        {
            return Err("The outline or visibility changed outside history.");
        }
        let state = if undo { &self.before } else { &self.after };
        let store = workbook.store.clone();
        store.batch(|_| {
            workbook
                .set_outline(sheet, state.outline.clone())
                .expect("history holds a validated outline");
            workbook
                .restore_sheet_visibility(sheet, &state.visibility)
                .expect("preflight checked sheet identity");
        });
        Ok(())
    }

    pub(super) fn retained_bytes(&self) -> usize {
        [&self.before, &self.after]
            .iter()
            .map(|state| {
                (state.outline.rows.len() + state.outline.columns.len())
                    * std::mem::size_of::<crate::outline::OutlineGroup>()
                    + (state.visibility.rows.len() + state.visibility.columns.len()) * 4
            })
            .sum()
    }
}

impl WorkbookHistory {
    pub fn change_outline(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        axis: OutlineAxis,
        action: OutlineAction,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let before = OutlineState {
            outline: workbook
                .sheet(sheet)
                .ok_or("The worksheet no longer exists.")?
                .outline()
                .clone(),
            visibility: workbook.sheet_visibility(sheet)?,
        };
        let outline = before.outline.changed(axis, action)?;
        if outline == before.outline {
            return Ok(false);
        }
        let (start, end, label) = match action {
            OutlineAction::Group { start, end } => (start, end, "Group"),
            OutlineAction::Ungroup { start, end } => (start, end, "Ungroup"),
            OutlineAction::SetCollapsed { index, collapsed } => {
                let group = &outline.groups(axis)[index];
                (
                    group.start,
                    group.end,
                    if collapsed {
                        "Collapse group"
                    } else {
                        "Expand group"
                    },
                )
            }
            OutlineAction::ShowLevel { .. } => (0, 0, "Show outline level"),
        };
        let mut visibility = before.visibility.clone();
        if matches!(action, OutlineAction::Ungroup { .. }) {
            // Excel 取消分组不自动取消隐藏：丢失的折叠覆盖转为手动隐藏。
            let hidden = match axis {
                OutlineAxis::Row => &mut visibility.rows,
                OutlineAxis::Column => &mut visibility.columns,
            };
            let remaining: BTreeSet<_> = outline.hidden_indices(axis).collect();
            let mut manual: BTreeSet<_> = hidden.iter().copied().collect();
            manual.extend(
                before
                    .outline
                    .hidden_indices(axis)
                    .filter(|i| !remaining.contains(i)),
            );
            *hidden = manual.into_iter().collect();
        }
        let after = OutlineState {
            outline,
            visibility,
        };
        let key = workbook.sheet_key(sheet).unwrap();
        let change = OutlineChange { before, after };
        change.apply(workbook, sheet, key, false)?;
        let range = if axis == OutlineAxis::Row {
            CellRange::new(CellAddress::new(start, 0), CellAddress::new(end, 0))
        } else {
            CellRange::new(CellAddress::new(0, start), CellAddress::new(0, end))
        };
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::Outline(change),
        });
        Ok(true)
    }
}
