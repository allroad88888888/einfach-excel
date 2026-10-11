//! workbook initialization operations.

use super::*;

impl Workbook {
    pub fn new() -> Self {
        let store = Store::new();
        let custom_call_depth = Rc::new(Cell::new(0));
        let atom_context = WorkbookAtomContext::new(store.clone(), Rc::clone(&custom_call_depth));
        let mut wb = Workbook {
            store,
            atom_context,
            sheets: Vec::new(),
            sheet_keys: Vec::new(),
            next_sheet_key: 1,
            names: Vec::new(),
            by_name: HashMap::new(),
            cycle_ast_walk_count: Cell::new(0),
            named_values: BTreeMap::new(),
            custom_functions: None,
            custom_call_depth,
            content_revision: 0,
            tables: BTreeMap::new(),
            tables_epoch: 0,
            print_configs: Vec::new(),
            conditional_formats: Vec::new(),
            conditional_range_atoms: Default::default(),
        };
        // Default sheet so users can `wb.active_mut()` without first calling
        // add_sheet — matches the Excel "blank file already has Sheet1" UX.
        wb.add_sheet("Sheet1");
        wb
    }

    pub(crate) fn sync_atom_topology(&mut self) {
        let arrays = self.named_array_dependents();
        let sheets = self
            .sheets
            .iter()
            .enumerate()
            .map(|(idx, sheet)| {
                sheet.attach_workbook_context(&self.atom_context, idx);
                (self.names[idx].clone(), sheet.facade_ctx())
            })
            .collect();
        self.atom_context.sync_topology(sheets, &self.sheet_keys);
        // 删除来源表也必须清掉旧溢出，不能只让未投影的标量公式失效。
        self.recompute_array_formula_groups(arrays);
    }

    pub(crate) fn sync_atom_names(&mut self) {
        // 名称改变可能使数组变长/缩短；仅沿已有名称依赖修复 spill，不能扫全表。
        let arrays = self.named_array_dependents();
        self.publish_atom_names();
        self.recompute_array_formula_groups(arrays);
    }

    pub(super) fn publish_atom_names(&self) {
        let names = self
            .named_values
            .iter()
            .map(|(key, entry)| (key.clone(), entry.definition.clone()))
            .collect();
        self.atom_context.sync_names(names);
    }

    pub(super) fn named_array_dependents(&self) -> Vec<(usize, HashSet<CellAddress>)> {
        self.array_dependents_for_atoms(&self.atom_context.name_dependent_atoms())
    }

    /// 名称与 Table 元数据共用现有依赖图，只找可能需要更新 spill 的公式。
    pub(super) fn array_dependents_for_atoms(
        &self,
        atoms: &[AtomId],
    ) -> Vec<(usize, HashSet<CellAddress>)> {
        self.sheets
            .iter()
            .enumerate()
            .filter_map(|(index, sheet)| {
                let addresses = sheet.array_formula_addrs_for_store_atoms(atoms);
                (!addresses.is_empty()).then_some((index, addresses))
            })
            .collect()
    }

    /// 局部批量写入只收集该范围的实际 atom 依赖，用于提交/撤销后的数组重投。
    pub(crate) fn array_dependents_for_range(
        &self, sheet: usize, range: CellRange,
    ) -> Vec<(usize, HashSet<CellAddress>)> {
        let roots = self.sheets[sheet].store_root_atoms_for_range(range);
        let dependents = self.store.reverse_dependents(&roots);
        self.array_dependents_for_atoms(&dependents)
    }

    /// Push the current Table registry into the atom context so the
    /// formula-inner provider can resolve structured references (design doc
    /// #32 §5.3). Called from `bump_tables_epoch`, i.e. after every registry
    /// mutation.
    pub(crate) fn sync_atom_tables(&self) {
        let tables = self
            .tables
            .iter()
            .map(|(key, entry)| {
                (
                    key.clone(),
                    ProjectedTable {
                        sheet_name: entry.sheet_name.clone(),
                        range: entry.range,
                        has_headers: entry.has_headers,
                        has_totals: entry.has_totals,
                        columns: entry.columns.clone(),
                    },
                )
            })
            .collect();
        self.atom_context.sync_tables(tables);
    }
}
