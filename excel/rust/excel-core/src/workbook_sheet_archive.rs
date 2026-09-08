//! 保留被删除的原生 Sheet，恢复时重接同一 Store，不序列化/重建全部单元格。
use super::*;
use std::rc::Weak;

pub struct ArchivedWorksheet {
    sheet: Sheet,
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

    /// 拒绝跨 Workbook 恢复或覆盖另一次拓扑修改；失败时把原资源完整交还调用者。
    pub fn restore(self, workbook: &mut Workbook) -> Result<usize, Self> {
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
            workbook.sheets.insert(index, self.sheet);
            workbook.sheet_keys.insert(index, self.key);
            workbook.names.insert(index, self.name);
            workbook.print_configs.insert(index, self.print_config);
            workbook
                .conditional_formats
                .insert(index, self.conditional_format);
            let tables_changed = !self.tables.is_empty();
            for table in self.tables {
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
            for (sheet, addr, source) in self.references {
                workbook.set_formula(sheet, &addr.to_string_repr(), &source);
            }
        });
        Ok(index)
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
            sheet,
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
