//! workbook names operations.

use super::*;

impl Workbook {
    pub fn define_name(&mut self, name: &str, formula: &str) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        let expr = parse_formula(formula).ok_or(WorkbookError::ParseFailed)?;

        // Evaluate against a workbook provider rooted on sheet 0. Sheet
        // index 0 is guaranteed to exist (constructor seeds Sheet1) so
        // we don't need to guard the index here.
        let provider = WorkbookEvalProvider {
            wb: self,
            current: Cell::new(0),
            current_cell: Cell::new(None),
        };
        let value = eval_expr_with_provider(&expr, &provider);
        // Drop the provider's borrow before mutating self.
        drop(provider);
        if let Value::Error(e) = value {
            return Err(WorkbookError::EvalFailed(e));
        }
        self.define_name_value(name, value)
    }

    /// Register a pre-built `Value` under `name`. Mostly used by tests
    /// and by hosts that already hold a constructed `Value` (e.g. after
    /// deserialization). Production callers usually want `define_name`,
    /// which handles the parse+eval round-trip.
    ///
    /// Validation:
    ///   - `name` must match `[A-Za-z_][A-Za-z0-9_]*`, length 1..=255.
    ///   - The uppercased name must not collide with a built-in function
    ///     name (`SUM`, `IF`, etc.).
    ///
    /// On success, the workbook name-version atom changes. Formulas that read
    /// the registry are invalidated by their recorded Store dependency.
    pub fn define_name_value(&mut self, name: &str, value: Value) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        Self::validate_name(name)?;
        let key = name.to_ascii_uppercase();
        if is_builtin_function_name(&key) {
            return Err(WorkbookError::ReservedName);
        }
        // Shared namespace with the Table registry (design doc #32 §4.2,
        // reverse direction): a defined name may not shadow an existing
        // Table name. The forward direction — a Table refusing an existing
        // defined name — is enforced in `validate_table_name`.
        if self.tables.contains_key(&key) {
            return Err(WorkbookError::NameConflict);
        }
        self.named_values.insert(
            key,
            NamedEntry {
                canonical_name: name.to_string(),
                value,
            },
        );
        self.sync_atom_names();
        Ok(())
    }

    /// Remove a previously-registered name. Idempotent — a no-op when
    /// no entry exists for `name`. Returns `true` if an entry was
    /// removed, `false` otherwise. Publishes the workbook name-version root
    /// the same way `define_name` does, so formulas that recorded that Store
    /// dependency re-evaluate and now surface `#NAME?`.
    pub fn undefine_name(&mut self, name: &str) -> bool {
        if self.is_inside_custom_call() {
            return false; // re-entrancy guard
        }
        let key = name.to_ascii_uppercase();
        let removed = self.named_values.remove(&key).is_some();
        if removed {
            self.sync_atom_names();
        }
        removed
    }

    /// Case-insensitive lookup. Returns a clone of the registered
    /// value, or `None` if no entry exists. Top-level evaluator surfaces use
    /// this directly; formula-inner atoms read the synchronized registry
    /// through `WorkbookAtomContext` so the name-version Store edge is
    /// recorded in their active `ReadArgs` frame.
    pub fn get_named(&self, name: &str) -> Option<Value> {
        let key = name.to_ascii_uppercase();
        self.named_values.get(&key).map(|e| e.value.clone())
    }

    /// Iterator over registered names in canonical (user-typed) casing,
    /// sorted alphabetically by their uppercased key. Companion API for
    /// hosts that want to display the registry — the underlying value
    /// is intentionally not exposed here (callers go through
    /// `get_named` if they need it) so a future host that needs only
    /// the names doesn't end up cloning every Lambda.
    pub fn named_names(&self) -> impl Iterator<Item = &str> {
        self.named_values
            .values()
            .map(|e| e.canonical_name.as_str())
    }
}
