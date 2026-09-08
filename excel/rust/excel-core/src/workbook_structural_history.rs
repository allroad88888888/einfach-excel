//! 结构历史只保留被位移的稀疏带及带外真正改写的公式，不复制无关工作表。
use super::*;
use crate::filter::SheetAutoFilter;
use crate::history_snapshot::HistorySnapshot;
use crate::shift::{rewrite_parked_source, rewrite_qualified_source, ShiftEdit, SourceRewrite};

#[derive(Debug)]
pub(crate) struct StructuralHistoryChange {
    pub(crate) edit: ShiftEdit,
    name: String,
    before: StructuralSnapshot,
    after: StructuralSnapshot,
}

#[derive(Debug)]
struct StructuralSnapshot {
    cells: Vec<(usize, HistorySnapshot)>,
    visibility: SheetVisibility,
    filter: Option<SheetAutoFilter>,
    tables: Vec<TableEntry>,
}

impl StructuralHistoryChange {
    pub(crate) fn edit(
        workbook: &mut Workbook,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<Option<(Self, CellRange)>, &'static str> {
        workbook.validate_structural_edit(sheet, edit)?;
        let (at, count) = match edit {
            ShiftEdit::RowInsert { at, count }
            | ShiftEdit::RowDelete { at, count }
            | ShiftEdit::ColInsert { at, count }
            | ShiftEdit::ColDelete { at, count } => (at, count),
        };
        if count == 0 {
            return Ok(None);
        }
        let end = CellAddress::new(
            crate::sheet::EXCEL_MAX_ROWS - 1,
            crate::sheet::EXCEL_MAX_COLS - 1,
        );
        let start = if edit.is_row_edit() {
            CellAddress::new(at, 0)
        } else {
            CellAddress::new(0, at)
        };
        let tail = CellRange::new(start, end);
        let range = CellRange::new(
            start,
            if edit.is_row_edit() {
                CellAddress::new(at + count - 1, end.col)
            } else {
                CellAddress::new(end.row, at + count - 1)
            },
        );
        let name = workbook.name(sheet).unwrap().to_owned();
        let mut targets = vec![(sheet, tail)];
        for (index, current) in workbook.sheets.iter().enumerate() {
            let mut addrs: Vec<_> = current
                .formula_addrs_in_range(CellRange::new(CellAddress::new(0, 0), end))
                .into_iter()
                .collect();
            addrs.sort_by_key(|addr| (addr.row, addr.col));
            for addr in addrs {
                if index == sheet && tail.contains(addr) {
                    continue;
                }
                let source = current.formula_text_at(addr).unwrap();
                let local_changed = index == sheet
                    && !matches!(
                        rewrite_parked_source(&source, edit),
                        SourceRewrite::Unchanged
                    );
                if local_changed || rewrite_qualified_source(&source, &name, edit).is_some() {
                    targets.push((index, CellRange::new(addr, addr)));
                }
            }
        }
        let before = StructuralSnapshot::capture(workbook, sheet, &targets);
        workbook.try_structural_edit(sheet, edit)?;
        let after = StructuralSnapshot::capture(workbook, sheet, &targets);
        Ok(Some((
            Self {
                edit,
                name,
                before,
                after,
            },
            range,
        )))
    }

    pub(crate) fn affected_sheets(&self) -> Vec<usize> {
        self.before
            .cells
            .iter()
            .map(|(sheet, _)| *sheet)
            .collect::<BTreeSet<_>>()
            .into_iter()
            .collect()
    }

    pub(crate) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() || workbook.name(sheet) != Some(self.name.as_str()) {
            return Err("The worksheet changed outside history.");
        }
        let snapshot = if undo { &self.before } else { &self.after };
        if snapshot.tables.iter().any(|table| {
            workbook
                .tables
                .get(&table.name().to_ascii_uppercase())
                .is_some_and(|current| current.sheet_name != self.name)
        }) {
            return Err("A table name is already used by another worksheet.");
        }
        // 身份检查由 HistoryEntry 在进入这里之前完成，之后恢复原生快照没有可失败的写入分支。
        let indices = self.affected_sheets();
        let observers: Vec<_> = indices
            .iter()
            .map(|index| {
                (
                    *index,
                    workbook.sheets[*index].suspend_structure_notifications(),
                )
            })
            .collect();
        let store = workbook.store.clone();
        store.batch(|_| {
            let mut anchors = Vec::new();
            for index in &indices {
                let cells: Vec<_> = snapshot
                    .cells
                    .iter()
                    .filter(|(s, _)| s == index)
                    .map(|(_, snapshot)| snapshot)
                    .collect();
                anchors.push((
                    *index,
                    workbook.sheets[*index].restore_structure_content(&cells),
                ));
            }
            workbook
                .restore_sheet_visibility(sheet, &snapshot.visibility)
                .expect("preflight checked workbook state");
            let (rules, hidden) = snapshot
                .filter
                .as_ref()
                .map(|filter| (filter.rules().to_vec(), filter.hidden_set().clone()))
                .unwrap_or_default();
            workbook.sheets[sheet].commit_filter(rules, hidden);
            workbook.republish_hidden(sheet);
            let tables_changed = workbook
                .tables
                .values()
                .filter(|table| table.sheet_name == self.name)
                .count()
                != snapshot.tables.len()
                || snapshot.tables.iter().any(|table| {
                    workbook.tables.get(&table.name().to_ascii_uppercase()) != Some(table)
                });
            if tables_changed {
                workbook
                    .tables
                    .retain(|_, table| table.sheet_name != self.name);
                for table in &snapshot.tables {
                    workbook
                        .tables
                        .insert(table.name().to_ascii_uppercase(), table.clone());
                }
                workbook.bump_tables_epoch();
            }
            for (index, candidates) in anchors {
                workbook.sheets[index].project_bulk_spill_anchors(candidates);
            }
        });
        for (index, observers) in observers {
            workbook.sheets[index].resume_structure_notifications(observers);
        }
        Ok(())
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.name.len() + self.before.retained_bytes() + self.after.retained_bytes()
    }
}

impl StructuralSnapshot {
    fn capture(workbook: &Workbook, sheet: usize, targets: &[(usize, CellRange)]) -> Self {
        Self {
            cells: targets
                .iter()
                .map(|(index, range)| {
                    (
                        *index,
                        HistorySnapshot::capture(&workbook.sheets[*index], *range, true),
                    )
                })
                .collect(),
            visibility: workbook.sheet_visibility(sheet).unwrap(),
            filter: workbook.sheets[sheet].filter().cloned(),
            tables: workbook
                .tables
                .values()
                .filter(|table| Some(table.sheet_name.as_str()) == workbook.name(sheet))
                .cloned()
                .collect(),
        }
    }

    fn retained_bytes(&self) -> usize {
        self.cells
            .iter()
            .map(|(_, snapshot)| snapshot.retained_bytes())
            .sum::<usize>()
            + crate::sheet::metadata_bytes(&self.visibility)
            + crate::sheet::metadata_bytes(&self.filter)
            + crate::sheet::metadata_bytes(&self.tables)
    }
}
