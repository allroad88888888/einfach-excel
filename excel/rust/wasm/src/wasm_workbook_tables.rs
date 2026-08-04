#[wasm_bindgen]
impl WasmWorkbook {
    #[wasm_bindgen(js_name = "defineName")]
    pub fn define_name(&mut self, name: &str, formula: &str) -> Result<(), JsValue> {
        self.workbook
            .define_name(name, formula)
            .map_err(workbook_error_to_js)
    }

    /// Remove a previously-registered name. Returns `true` if an entry
    /// was removed; `false` if no entry existed. Publishing the name-version
    /// root makes dependent formula-inner atoms re-derive to `#NAME?` (or any
    /// newly-shadowing definition).
    #[wasm_bindgen(js_name = "undefineName")]
    pub fn undefine_name(&mut self, name: &str) -> bool {
        self.workbook.undefine_name(name)
    }

    /// Enumerate the workbook's defined names in canonical (user-typed)
    /// casing, sorted alphabetically by uppercased key. Useful for the
    /// W2 name-manager dialog so it doesn't need to subscribe to every
    /// `defineName` call individually.
    #[wasm_bindgen(js_name = "definedNames")]
    pub fn defined_names(&self) -> Vec<String> {
        self.workbook.named_names().map(|s| s.to_string()).collect()
    }

    // === Excel Table registry (#32) — CRUD over the workbook-level Table
    // registry. `has_headers` is hard-`true` (MVP); the range is passed as
    // 0-based inclusive bounds (matching `clear_range`). Errors surface as
    // the stable strings from `table_error_to_js`.

    /// Define a Table over `[start..=end]` on `sheet_idx`. `name` is
    /// `Some` to use an explicit (validated) name, or `None`/`undefined`
    /// to auto-generate `Table1`, `Table2`, …. Returns the final
    /// (canonical-cased) Table name.
    #[wasm_bindgen(js_name = "createTable")]
    pub fn create_table(
        &mut self,
        sheet_idx: u32,
        start_row: u32,
        start_col: u32,
        end_row: u32,
        end_col: u32,
        name: Option<String>,
    ) -> Result<String, JsValue> {
        let range = CellRange::new(
            CellAddress::new(start_row, start_col),
            CellAddress::new(end_row, end_col),
        );
        self.workbook
            .define_table(name.as_deref(), sheet_idx as usize, range, true)
            .map_err(table_error_to_js)
    }

    /// Rename a Table, rewriting every referencing formula's text.
    #[wasm_bindgen(js_name = "renameTable")]
    pub fn rename_table(&mut self, name: &str, new_name: &str) -> Result<(), JsValue> {
        self.workbook
            .rename_table(name, new_name)
            .map_err(table_error_to_js)
    }

    /// Rename one column of a Table, rewriting every referencing formula.
    #[wasm_bindgen(js_name = "renameTableColumn")]
    pub fn rename_table_column(
        &mut self,
        name: &str,
        old_column: &str,
        new_column: &str,
    ) -> Result<(), JsValue> {
        self.workbook
            .rename_table_column(name, old_column, new_column)
            .map_err(table_error_to_js)
    }

    /// Remove a Table's registry entry (convert to range — values, formulas,
    /// and formats are untouched).
    #[wasm_bindgen(js_name = "deleteTable")]
    pub fn delete_table(&mut self, name: &str) -> Result<(), JsValue> {
        self.workbook.delete_table(name).map_err(table_error_to_js)
    }

    /// Every registered Table as `TableJSON[]`, alphabetical by uppercased
    /// name (the engine's stable order).
    #[wasm_bindgen(js_name = "listTables")]
    pub fn list_tables(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&self.tables_json())
            .map_err(|err| JsValue::from_str(&format!("serialize tables: {err}")))
    }

    /// One Table as `TableJSON`, or `null` when no Table is registered under
    /// `name` (case-insensitive).
    #[wasm_bindgen(js_name = "getTable")]
    pub fn get_table(&self, name: &str) -> Result<JsValue, JsValue> {
        match self.workbook.get_table(name) {
            Some(entry) => {
                let idx = self.sheet_index_by_name(entry.sheet_name()).unwrap_or(0);
                serde_wasm_bindgen::to_value(&TableJSON::from_entry(entry, idx))
                    .map_err(|err| JsValue::from_str(&format!("serialize table: {err}")))
            }
            None => Ok(JsValue::null()),
        }
    }

    /// Capture the whole Excel Table registry as an undo before-image
    /// (design doc #32 §11/§12). Returns
    /// `{ version: 1, tables: TableJSON[] }` — the same per-Table shape
    /// `listTables` emits, wrapped in a versioned envelope.
    ///
    /// This is the missing before-image for Table DEFINITION changes:
    /// everything `createTable` / `renameTable` / `deleteTable` / the totals
    /// toggle writes into CELLS is already covered by the host's sparse-cell
    /// and format snapshots, but the registry itself (name, sheet anchor,
    /// range, header/totals flags, column names) was not. A host records
    /// this before the mutation and replays it through `restoreTables` to
    /// undo. Pure read — no epoch bump, no recompute.
    #[wasm_bindgen(js_name = "snapshotTables")]
    pub fn snapshot_tables(&self) -> Result<JsValue, JsValue> {
        serde_wasm_bindgen::to_value(&TableRegistrySnapshotJSON {
            version: 1,
            tables: self.tables_json(),
        })
        .map_err(|err| JsValue::from_str(&format!("serialize table snapshot: {err}")))
    }

    /// Replace the whole Table registry with a `snapshotTables` payload,
    /// returning the number of Tables now registered.
    ///
    /// **REPLACE, not additive** (unlike `restoreSparse`): Tables created
    /// after the snapshot are dropped and Tables deleted since are revived,
    /// which is what makes a Table-definition undo symmetric. Restoring an
    /// empty `tables` array therefore CLEARS the registry — it is not a
    /// no-op.
    ///
    /// All-or-nothing: the payload is fully validated (cap 256, name shape,
    /// the §4.2 name mutex against current defined names, same-sheet range
    /// overlap, column-count vs range width) before anything is swapped, so a
    /// rejection leaves the live registry untouched. Errors are the stable
    /// `table_error_to_js` strings plus `"unsupported-snapshot-version"` and
    /// parse messages for a malformed envelope. Only cell values/formulas are
    /// left alone — the registry is a view over them.
    ///
    /// A restore that changes the registry bumps the tables epoch, so
    /// `=SUM(Table1[Qty])` and friends re-derive against the restored
    /// geometry; a restore that reproduces the current registry exactly
    /// skips the bump.
    #[wasm_bindgen(js_name = "restoreTables")]
    pub fn restore_tables(&mut self, value: JsValue) -> Result<u32, JsValue> {
        let payload: TableRegistrySnapshotJSON = serde_wasm_bindgen::from_value(value)
            .map_err(|err| JsValue::from_str(&format!("invalid table snapshot: {err}")))?;
        self.restore_tables_json(payload)
            .map_err(|err| JsValue::from_str(&err))
    }

    // Push the host's per-sheet MANUALLY-hidden row set as read-only SUBTOTAL
    // 101-111 evaluation input (design doc #32 §6, CANONICAL_OWNERSHIP §7-1).
    // `rows` is a `number[]` of 0-based hidden row indices; full-replace
    // semantics (an empty array clears the sheet's set). The engine models no
    // hidden state — it consumes this purely as evaluation input, and the
    // paired epoch bump re-derives only the 101-111 formulas that read it.
    // SUBTOTAL 1-11 deliberately ignore this set (Excel includes manually
    // hidden rows in 1-11); filter-hidden rows go through
    // `setEvalFilterHiddenRows` instead.
}
