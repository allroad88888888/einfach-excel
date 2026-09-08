//! 保留被删除的原生 Sheet，恢复时重接同一 Store，不序列化/重建全部单元格。
use super::*;
use std::rc::Weak;

pub struct ArchivedWorksheet {
    // 成功恢复时取走；只有仍持有 Sheet 的归档被丢弃才释放原生资源。
    sheet: Option<Sheet>,
    key: u64,
    index: usize,
    name: String,
    print_config: workbook_print_config::SheetPrintConfig,
    conditional_format: workbook_conditional_format_types::SheetConditionalFormatConfig,
    tables: Vec<TableEntry>,
    // 只保存删除真正改写过的其它表公式；Sheet 自己的公式由原对象保留。
    references: Vec<(usize, CellAddress, String)>,
    remaining_names: Vec<String>,
    remaining_keys: Vec<u64>,
    origin: Weak<WorkbookAtomContext>,
}

impl std::fmt::Debug for ArchivedWorksheet {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ArchivedWorksheet")
            .field("name", &self.name)
            .field("key", &self.key)
            .field("index", &self.index)
            .finish_non_exhaustive()
    }
}

impl ArchivedWorksheet {
    pub fn key(&self) -> u64 {
        self.key
    }

    pub(crate) fn retained_bytes(&self) -> usize {
        use crate::sheet::metadata_bytes;
        self.sheet.as_ref().map_or(0, Sheet::history_retained_bytes)
            + self.name.len()
            + metadata_bytes(&self.print_config)
            + metadata_bytes(&self.conditional_format)
            + metadata_bytes(&self.tables)
            + metadata_bytes(&self.references)
            + metadata_bytes(&self.remaining_names)
            + self.remaining_keys.len() * 8
    }

    /// 撤销“新增”时，原先指向不存在表名的公式仍应保留原始源，而不是永久改成 #REF!。
    pub(crate) fn restore_missing_reference_sources(&self, workbook: &mut Workbook) {
        for (sheet, addr, source) in &self.references {
            let index = if *sheet > self.index {
                sheet - 1
            } else {
                *sheet
            };
            workbook.set_formula(index, &addr.to_string_repr(), source);
        }
    }

    /// 拒绝跨 Workbook 恢复或覆盖另一次拓扑修改；失败时把原资源完整交还调用者。
    pub fn restore(mut self, workbook: &mut Workbook) -> Result<usize, Self> {
        if workbook.is_inside_custom_call()
            || !self
                .origin
                .upgrade()
                .is_some_and(|origin| Rc::ptr_eq(&origin, &workbook.atom_context))
            || workbook.names != self.remaining_names
            || workbook.sheet_keys != self.remaining_keys
            || self.tables.iter().any(|table| {
                workbook
                    .tables
                    .contains_key(&table.name().to_ascii_uppercase())
            })
        {
            return Err(self);
        }
        let index = self.index;
        let store = workbook.store.clone();
        store.batch(|_| {
            workbook
                .sheets
                .insert(index, self.sheet.take().expect("archive owns its sheet"));
            workbook.sheet_keys.insert(index, self.key);
            workbook.names.insert(index, std::mem::take(&mut self.name));
            workbook
                .print_configs
                .insert(index, std::mem::take(&mut self.print_config));
            workbook
                .conditional_formats
                .insert(index, std::mem::take(&mut self.conditional_format));
            let tables_changed = !self.tables.is_empty();
            for table in self.tables.drain(..) {
                workbook
                    .tables
                    .insert(table.name().to_ascii_uppercase(), table);
            }
            if tables_changed {
                workbook.bump_tables_epoch();
            }
            workbook.rebuild_name_lookup();
            workbook.sync_atom_topology();
            workbook.republish_hidden_all();
            for (sheet, addr, source) in self.references.drain(..) {
                workbook.set_formula(sheet, &addr.to_string_repr(), &source);
            }
        });
        Ok(index)
    }
}

impl Drop for ArchivedWorksheet {
    fn drop(&mut self) {
        if let Some(sheet) = self.sheet.as_mut() {
            sheet.release_archived_atoms();
        }
    }
}

impl Workbook {
    /// 与普通删除完全相同的语义，但保留恢复所需的资源；预检失败不删除。
    pub fn archive_sheet(&mut self, index: usize) -> Option<ArchivedWorksheet> {
        if self.is_inside_custom_call() || self.sheet_count() <= 1 {
            return None;
        }
        let name = self.name(index)?.to_owned();
        let key = self.sheet_key(index)?;
        let print_config = self.print_configs[index].clone();
        let conditional_format = self.conditional_formats[index].clone();
        let tables = self
            .tables
            .values()
            .filter(|table| table.sheet_name == name)
            .cloned()
            .collect();
        let references = self
            .sheet_ref_rewrites(&name, None)
            .into_iter()
            .filter(|(sheet, _, _)| *sheet != index)
            .map(|(sheet, addr, _)| {
                (
                    sheet,
                    addr,
                    self.sheets[sheet].formula_text_at(addr).unwrap(),
                )
            })
            .collect();
        let sheet = self.remove_sheet(index)?;
        Some(ArchivedWorksheet {
            sheet: Some(sheet),
            key,
            index,
            name,
            print_config,
            conditional_format,
            tables,
            references,
            remaining_names: self.names.clone(),
            remaining_keys: self.sheet_keys.clone(),
            origin: Rc::downgrade(&self.atom_context),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workbook_history::WorkbookHistory;

    #[test]
    fn evicting_archive_releases_its_shared_store_atoms() {
        let mut workbook = Workbook::new();
        workbook.add_sheet("Large");
        let baseline = workbook.store.debug_total_atom_count();
        workbook.set_cell(1, "A1", Value::Text("x".repeat(33 * 1024 * 1024)));
        assert!(workbook.store.debug_total_atom_count() > baseline);
        let mut history = WorkbookHistory::default();
        history.remove_sheet(&mut workbook, 1).unwrap();
        assert_eq!(history.undo_count(), 0);
        assert_eq!(workbook.store.debug_total_atom_count(), baseline);
    }

    #[test]
    fn clearing_archives_reclaims_formula_chains_and_spills_without_touching_live_sheets() {
        let mut workbook = Workbook::new();
        workbook.set_cell(0, "A1", Value::Number(11.0));
        let mut history = WorkbookHistory::default();
        let mut settled_count = None;
        for _ in 0..3 {
            let index = workbook.add_sheet("Temporary");
            workbook.set_cell(index, "A1", Value::Number(7.0));
            workbook.set_formula(index, "B1", "=A1+1");
            workbook.set_formula(index, "C1", "=B1*2");
            workbook.set_formula(index, "D1", "=SEQUENCE(10)");
            assert_eq!(workbook.get_cell("Temporary", "C1"), Value::Number(16.0));
            assert_eq!(workbook.get_cell("Temporary", "D10"), Value::Number(10.0));
            history.remove_sheet(&mut workbook, index).unwrap();
            let held = workbook.store.debug_total_atom_count();
            history.clear("");
            let released = workbook.store.debug_total_atom_count();
            assert!(released < held);
            if let Some(previous) = settled_count {
                assert_eq!(
                    released, previous,
                    "repeated archive eviction must not leak atoms"
                );
            }
            settled_count = Some(released);
            assert_eq!(workbook.get_cell("Sheet1", "A1"), Value::Number(11.0));
        }
    }
}
