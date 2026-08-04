#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(constructor)]
    pub fn new() -> Self {
        install_panic_hook();
        let custom_formulas = Arc::new(WasmCustomFormulaRegistry::new());
        let mut workbook = Workbook::new();
        // Install the registry on the inner workbook so the formula
        // engine's `WorkbookEvalProvider::call_custom` can reach it. The
        // Arc clone is cheap — same map, two handles.
        workbook.set_custom_function_registry(Some(
            custom_formulas.clone() as Arc<dyn CustomFunctionRegistry>
        ));
        WasmWorkbook {
            workbook,
            subscriptions: HashMap::new(),
            next_token: 0,
            custom_formulas,
            last_bulk_import_phase_ms: Cell::new(None),
        }
    }

    pub fn sheet_count(&self) -> u32 {
        self.workbook.sheet_count() as u32
    }

    pub fn sheet_name(&self, idx: u32) -> String {
        self.workbook
            .name(idx as usize)
            .map(str::to_string)
            .unwrap_or_default()
    }

    pub fn add_sheet(&mut self, name: &str) -> u32 {
        self.workbook.add_sheet(name) as u32
    }

    pub fn rename_sheet(&mut self, idx: u32, name: &str) -> bool {
        self.workbook.rename_sheet(idx as usize, name)
    }

    pub fn remove_sheet(&mut self, idx: u32) -> bool {
        let idx = idx as usize;
        if self.workbook.remove_sheet(idx).is_none() {
            return false;
        }
        // Mirror move_sheet: keep token → (sheet_idx, sub) accurate across
        // the shift, or a later unsubscribe_cell resolves against the WRONG
        // sheet (off by one) and leaves the engine-side callback alive,
        // emitting dirty events with a pre-removal index. Tokens on the
        // removed sheet are dropped — their engine subscription died with
        // the sheet.
        self.subscriptions.retain(|_, entry| entry.sheet_idx != idx);
        for entry in self.subscriptions.values_mut() {
            if entry.sheet_idx > idx {
                entry.sheet_idx -= 1;
            }
        }
        true
    }

    pub fn move_sheet(&mut self, from: u32, to: u32) -> bool {
        let from = from as usize;
        let to = to as usize;
        if !self.workbook.move_sheet(from, to) {
            return false;
        }
        for entry in self.subscriptions.values_mut() {
            entry.sheet_idx = remap_sheet_index_after_move(entry.sheet_idx, from, to);
        }
        true
    }

    pub fn set_number(&mut self, sheet_idx: u32, addr: &str, value: f64) {
        self.workbook
            .set_cell(sheet_idx as usize, addr, Value::Number(value));
    }

    pub fn set_text(&mut self, sheet_idx: u32, addr: &str, value: &str) {
        self.workbook
            .set_cell(sheet_idx as usize, addr, Value::Text(value.to_string()));
    }

    pub fn set_boolean(&mut self, sheet_idx: u32, addr: &str, value: bool) {
        self.workbook
            .set_cell(sheet_idx as usize, addr, Value::Boolean(value));
    }

    pub fn set_error(&mut self, sheet_idx: u32, addr: &str, value: &str) {
        let err = value_error_from_display(value);
        self.workbook
            .set_cell(sheet_idx as usize, addr, Value::Error(err));
    }

    pub fn set_formula(&mut self, sheet_idx: u32, addr: &str, formula: &str) -> bool {
        self.workbook.set_formula(sheet_idx as usize, addr, formula)
    }

    // Register a workbook-level defined name. `formula` must start with
    // `=`; the most common use is `define_name("SQUARE", "=LAMBDA(x,
    // x*x)")` so cells across all sheets can call `=SQUARE(5)`. The
    // result of evaluating `formula` is stored under `name`; subsequent
    // `Expr::Name` and `Expr::FuncCall` lookups for `name` (case-
    // insensitive) resolve through the registry.
    //
    // Returns a JS error string on validation / parse / eval failure:
    //   - `"reserved-name"` when `name` collides with a built-in
    //     function name (`SUM`, `IF`, `LAMBDA`, etc.).
    //   - `"invalid-name"` when `name` violates
    //     `[A-Za-z_][A-Za-z0-9_]*` (length 1..=255).
    //   - `"parse-failed"` when `formula` doesn't tokenize.
    //   - `"eval-failed: #DIV/0!"` (or other error code) when the
    //     definition's eval surfaces a cell-style error.
    //
    // On success the workbook name-version root is published. Materialized
    // formula-inner atoms that read the registry re-derive through their
    // Store dependency; unread formulas stay lazy.
}
