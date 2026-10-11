//! 创建 Table 的原子变更：仅保存表定义与表头前后像，不复制数据区。
use super::*;
use crate::history_snapshot::HistorySnapshot;
use crate::CellSnapshot;

#[derive(Debug)]
pub(crate) struct TableCreation {
    sheet: usize,
    entry: TableEntry,
    before: HistorySnapshot,
    after: HistorySnapshot,
}

impl TableCreation {
    pub(crate) fn prepare(
        workbook: &Workbook,
        sheet: usize,
        range: CellRange,
        name: Option<&str>,
    ) -> Result<Self, String> {
        let range = range.normalize();
        validate_range(workbook, sheet, range)?;
        let entry = workbook
            .prepare_table(name, sheet, range, true)
            .map_err(|error| error.to_string())?;
        let headers = CellRange::new(
            range.start,
            CellAddress::new(range.start.row, range.end.col),
        );
        let before = HistorySnapshot::capture(&workbook.sheets[sheet], headers, true);
        let mut after = before.clone();
        // 所见表头就是结构化引用使用的列名；公式表头冻结为显示文字，撤销还原源码。
        after.cells = Some(
            entry
                .columns
                .iter()
                .enumerate()
                .map(|(offset, text)| {
                    CellSnapshot::value(
                        CellAddress::new(range.start.row, range.start.col + offset as u32),
                        Value::Text(text.clone()),
                    )
                })
                .collect(),
        );
        Ok(Self {
            sheet,
            entry,
            before,
            after,
        })
    }

    pub(crate) fn name(&self) -> &str {
        self.entry.name()
    }

    pub(crate) fn apply(&self, workbook: &mut Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() {
            return Err("Cannot create a table during a custom call.");
        }
        if workbook.name(self.sheet) != Some(self.entry.sheet_name.as_str()) {
            return Err("The worksheet changed outside history.");
        }
        validate_range(workbook, self.sheet, self.entry.range)?;
        let key = self.entry.canonical_name.to_ascii_uppercase();
        if undo {
            if workbook.tables.get(&key) != Some(&self.entry) {
                return Err("The table changed outside history.");
            }
        } else {
            // Redo 仍检查名称与交叠；不能覆盖历史外新建的 Table 或名称。
            workbook
                .prepare_table(Some(self.name()), self.sheet, self.entry.range, true)
                .map_err(|_| "The table name or range is no longer available.")?;
        }
        let (expected, next) = if undo {
            (&self.after, &self.before)
        } else {
            (&self.before, &self.after)
        };
        if HistorySnapshot::capture(&workbook.sheets[self.sheet], expected.range, true) != *expected
        {
            return Err("The table header changed outside history.");
        }
        let arrays =
            workbook.array_dependents_for_atoms(&workbook.atom_context.table_dependent_atoms());
        let observers: Vec<_> = workbook
            .sheets
            .iter_mut()
            .map(|sheet| sheet.suspend_structure_notifications())
            .collect();
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            if undo {
                workbook.tables.remove(&key);
            } else {
                workbook.tables.insert(key, self.entry.clone());
            }
            workbook.bump_tables_epoch();
            result = next.restore(workbook, self.sheet);
        });
        // 锚点值传播完成后，再按既有依赖顺序更新同表/跨表的溢出几何。
        workbook.recompute_array_formula_groups(arrays);
        for (sheet, listeners) in workbook.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(listeners);
        }
        result
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        self.before.retained_bytes()
            + self.after.retained_bytes()
            + self.entry.columns.iter().map(String::len).sum::<usize>()
            + self.entry.canonical_name.len()
            + self.entry.sheet_name.len()
            + std::mem::size_of::<Self>()
    }
}

fn validate_range(workbook: &Workbook, sheet: usize, range: CellRange) -> Result<(), &'static str> {
    let sheet = workbook
        .sheet(sheet)
        .ok_or("The worksheet no longer exists.")?;
    if range.end.row > GRID_MAX_ROW || range.end.col > GRID_MAX_COL {
        return Err("The table range is outside the worksheet.");
    }
    if sheet
        .merged_ranges()
        .iter()
        .any(|merged| merged.intersects(range))
    {
        return Err("A table cannot contain merged cells.");
    }
    if sheet.spill_intersecting(range).is_some() {
        return Err("A table cannot overlap a spilled array.");
    }
    Ok(())
}
