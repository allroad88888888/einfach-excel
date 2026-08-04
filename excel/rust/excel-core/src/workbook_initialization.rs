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
            names: Vec::new(),
            by_name: HashMap::new(),
            cycle_ast_walk_count: Cell::new(0),
            named_values: BTreeMap::new(),
            custom_functions: None,
            custom_call_depth,
            content_revision: 0,
            tables: BTreeMap::new(),
            tables_epoch: 0,
        };
        // Default sheet so users can `wb.active_mut()` without first calling
        // add_sheet — matches the Excel "blank file already has Sheet1" UX.
        wb.add_sheet("Sheet1");
        wb
    }

    pub(crate) fn sync_atom_topology(&self) {
        let sheets = self
            .sheets
            .iter()
            .enumerate()
            .map(|(idx, sheet)| {
                sheet.attach_workbook_context(&self.atom_context, idx);
                (self.names[idx].clone(), sheet.facade_ctx())
            })
            .collect();
        self.atom_context.sync_topology(sheets);
    }

    pub(crate) fn sync_atom_names(&self) {
        let names = self
            .named_values
            .iter()
            .map(|(key, entry)| (key.clone(), entry.value.clone()))
            .collect();
        self.atom_context.sync_names(names);
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
