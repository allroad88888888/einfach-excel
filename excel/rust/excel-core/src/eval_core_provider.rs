use super::*;

/// Address-based evaluation source. Both production (Workbook) and the
/// legacy `eval_expr(get, cell_map)` shim route through this trait.
///
/// `Sheet`/`Workbook` use their own implementations (`SheetEvalProvider`,
/// `WorkbookEvalProvider`) to handle cross-sheet refs without ever
/// touching a thread-local. The legacy `AtomEvalProvider` below treats
/// any `SheetRef` as `#REF!` — it's a single-sheet shim used only by the
/// in-file eval tests + `eval_expr` callers that don't carry workbook
/// context.
/// A Table resolved from the workbook registry for a structured reference
/// (design doc #32 §5.3). Carries the full occupied rectangle (header +
/// data + optional totals) plus the metadata the area/column band math
/// needs; the resolver (`resolve_table_ref`) turns this into a concrete
/// runtime range that flows through the same machinery as a typed
/// `A1:A10` / `Sheet2!A1:A10`.
#[derive(Clone, Debug)]
pub struct ResolvedTable {
    /// Name of the sheet the Table is anchored to.
    pub sheet_name: String,
    /// 0-based index of that sheet (used to decide same-sheet vs
    /// cross-sheet resolution).
    pub sheet_index: usize,
    /// Normalized rectangle covering header + data (+ totals when shown).
    pub range: CellRange,
    /// Whether the first row of `range` is a header row (MVP: always true).
    pub has_headers: bool,
    /// Whether the last row of `range` is a totals row.
    pub has_totals: bool,
    /// Column display names left→right; index 0 maps to `range.start.col`.
    pub columns: Vec<String>,
}

pub trait EvalProvider {
    fn cell(&self, addr: CellAddress) -> Value;
    fn sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value;

    /// Read a cell without implicit-intersection collapse of dynamic-array
    /// anchors. Most evaluators want `cell()`; spill references (`A1#`) need
    /// the raw anchor array shape.
    fn raw_cell(&self, addr: CellAddress) -> Value {
        self.cell(addr)
    }

    /// Cross-sheet raw-cell variant for spill references such as `Data!A1#`.
    fn raw_sheet_cell(&self, sheet: &str, addr: CellAddress) -> Value {
        self.sheet_cell(sheet, addr)
    }

    /// Iterate every cell address in `range`, yielding `(addr, value)` to
    /// the closure. Used by `SUM` / `COUNT` / `AVERAGE` / `MIN` / `MAX` /
    /// `COUNTIF` / `SUMIF` for O(1)-memory streaming, and by the stateful
    /// aggregates (`MEDIAN`, `MODE`, `STDEV`, `VAR`, `LARGE`, `SMALL`,
    /// `VLOOKUP`, `HLOOKUP`, `INDEX`, `MATCH`) so they can build their
    /// local temp `Vec` without creating cell atoms.
    ///
    /// "Streaming" here means **no cell atom materialization**, not "O(1)
    /// memory" — the trait contract permits the callee body to keep a
    /// `Vec` if its algorithm demands one. Providers that know which
    /// addresses are sparse (e.g. `SheetEvalProvider` reads only
    /// `cells ∪ formula_cells`) should override this method so
    /// `SUM(A:A)` walks the dozen real cells instead of the column's
    /// nominal extent.
    ///
    /// The default impl iterates the rectangle densely via `range.iter()`
    /// and calls `self.cell(addr)` per cell — fine for small ranges and
    /// for shim providers that don't have sparse-index data.
    fn for_each_range_cell(&self, range: CellRange, f: &mut dyn FnMut(CellAddress, Value)) {
        for addr in range.iter() {
            let v = self.cell(addr);
            f(addr, v);
        }
    }

    /// Iterate a range on another sheet. Workbook providers override this
    /// with sparse sheet-aware traversal; single-sheet shims surface #REF!
    /// without walking the nominal rectangle.
    fn for_each_sheet_range_cell(
        &self,
        _sheet: &str,
        range: CellRange,
        f: &mut dyn FnMut(CellAddress, Value),
    ) {
        f(
            range.normalize().start,
            Value::Error(ValueError::InvalidRef),
        );
    }

    /// The cell currently being evaluated, if known. Used by `ROW()` /
    /// `COLUMN()` (no-arg) to return the formula's own row/column. Providers
    /// that don't track this (e.g. the legacy single-sheet shim) return None.
    fn current_cell(&self) -> Option<CellAddress> {
        None
    }

    /// Set the current cell being evaluated. Providers that surface
    /// `current_cell()` use this to push/pop the address as the evaluator
    /// recurses into nested formula cells. Default impl is a no-op so
    /// providers without a current-cell concept ignore the call.
    fn set_current_cell(&self, _addr: Option<CellAddress>) {}

    /// Explicit width in physical pixels of column `col` (0-based), or `None`
    /// when the column has no explicit width (the UI default). Consulted by
    /// `CELL("width")`, which converts pixels to Excel character units.
    ///
    /// Default `None`: providers without sheet-dimension access (the legacy
    /// single-sheet shim, the wasm-side and test shims) report "no explicit
    /// width", so `CELL("width")` falls back to Excel's default column width
    /// (8 characters). Sheet-backed providers (`SheetEvalProvider`,
    /// `AtomFormulaProvider`, `WorkbookEvalProvider`) override to read the
    /// per-column width map.
    fn col_width(&self, _col: u32) -> Option<u32> {
        None
    }

    /// Workbook-scope defined-name lookup. Returns a clone of the value
    /// registered under `name` (case-insensitive), or `None` if the
    /// workbook has no entry for that name.
    ///
    /// Default impl returns `None`: the legacy single-sheet shim
    /// (`AtomEvalProvider`) and any provider without a workbook context
    /// has no named registry, so an unbound `Expr::Name` still surfaces
    /// `#NAME?` exactly as before. Workbook-backed providers
    /// (`WorkbookEvalProvider`, the tracking wrapper) override to
    /// consult the workbook's `named_values` map.
    ///
    /// Consulted by `Expr::Name` (after LET-frame lookup) and by
    /// `Expr::FuncCall` dispatch (before the InvalidName fallback) so a
    /// registered `LAMBDA` value can be invoked with the function-call
    /// syntax `=SQUARE(5)`. LET bindings win over workbook names per
    /// Excel parity — `=LET(answer, 1, answer*2)` returns 2 even when
    /// `answer` is registered as 42.
    fn lookup_named(&self, _name: &str) -> Option<Value> {
        None
    }

    /// Does the cell at `addr` contain a formula? Default `false`.
    fn cell_has_formula(&self, _addr: CellAddress) -> bool {
        false
    }

    /// Does the cell at `(sheet, addr)` contain a formula? Providers without
    /// workbook context cannot resolve a sheet name, so the default is false.
    fn sheet_cell_has_formula(&self, _sheet: &str, addr: CellAddress) -> bool {
        let _ = addr;
        false
    }

    /// 0-based index of the sheet that owns the currently-active eval
    /// frame (in workbook context). Default `None`.
    fn current_sheet_index(&self) -> Option<usize> {
        None
    }

    /// Look up a sheet by name and return its 0-based index. Default `None`.
    fn sheet_index_of(&self, _name: &str) -> Option<usize> {
        None
    }

    /// Total sheets in the host workbook. Default `1`.
    fn sheet_count(&self) -> usize {
        1
    }

    /// Source formula text at `addr`, if any (for `FORMULATEXT(ref)`).
    /// Returns the literal formula source as the user typed it (leading
    /// `=` included), or `None` when the cell holds a primitive value
    /// (in which case the FORMULATEXT arm surfaces `#N/A`).
    ///
    /// Default returns `None` so legacy / sheet-less providers
    /// (`AtomEvalProvider`) consistently report "no formula" — they have
    /// no formula registry to consult. `SheetEvalProvider` (sheet.rs)
    /// and `WorkbookEvalProvider` (workbook.rs) override to look up the
    /// stored source in their `formula_texts` map.
    fn cell_formula_text(&self, _addr: CellAddress) -> Option<String> {
        None
    }

    /// Cross-sheet variant of `cell_formula_text`. Providers without workbook
    /// context cannot resolve a sheet name, so the default reports no formula
    /// instead of accidentally reading the same address on the current sheet.
    fn sheet_cell_formula_text(&self, _sheet: &str, addr: CellAddress) -> Option<String> {
        let _ = addr;
        None
    }

    // Custom function dispatch hook — see `CustomFunctionRegistry` below
    // for the host-side contract.

    /// Called when `eval_func` encounters a function name that is NOT a
    /// built-in and NOT registered as a workbook-level defined name
    /// (`Value::Lambda`). Lets a host plug in user-defined formulas —
    /// in the wasm bridge this delegates to a `js_sys::Function` registry
    /// keyed by upper-cased name (see `CUSTOM_FORMULAS.md`).
    ///
    /// Arguments are evaluated EAGERLY in left-to-right order before this
    /// method runs (no lazy semantics — custom functions can't introduce
    /// LET-style scoping). If any argument evaluates to `Value::Error`,
    /// `eval_named_call` propagates that error and `call_custom` is NOT
    /// invoked, matching the propagation behaviour of `apply_lambda`.
    ///
    /// Return contract:
    ///   - `None` → no custom function registered under `name`;
    ///     `eval_named_call` then surfaces `#NAME?` exactly as before.
    ///   - `Some(Value)` → the custom function ran. `Value::Error(_)` is
    ///     a valid result (the host's choice — e.g. a JS callback that
    ///     threw is typically wrapped as `Value::Error(InvalidValue)`).
    ///
    /// Default `None` so existing providers (`AtomEvalProvider`,
    /// `SheetEvalProvider`, the sparse / cumulative noop providers in
    /// this file) keep their current behaviour without code changes.
    fn call_custom(&self, _name: &str, _args: &[Value]) -> Option<Value> {
        None
    }

    /// Resolve a structured-reference Table (design doc #32 §5.3). `name`
    /// is `Some` for `Table1[...]` and `None` for a table-less `[Col]` /
    /// `[@Col]`, where the provider returns the Table that CONTAINS the
    /// current cell. Returns `None` when no such Table exists — the
    /// structured-reference resolver then surfaces `#NAME?` (named form) or
    /// `#VALUE!` (table-less form).
    ///
    /// Default `None`: providers without a workbook Table registry (the
    /// single-sheet shim, standalone sheets) never resolve structured
    /// references, so `=Table1[Col]` degrades to `#NAME?` exactly as an
    /// unbound name would.
    ///
    /// T2 seam: this reads the registry only. The reactive re-derive on a
    /// Table geometry/name change (the `tables_epoch` tracked read) lands
    /// in T3 — cell-CONTENT edges already register through the facade reads
    /// the resolved range performs, so ordinary recalculation is unaffected.
    fn lookup_table(&self, _name: Option<&str>) -> Option<ResolvedTable> {
        None
    }

    /// Host-pushed per-sheet hidden-row set consumed by SUBTOTAL 101-111
    /// (design doc #32 §6, CANONICAL_OWNERSHIP §7-1). `sheet_index` is the
    /// sheet OWNING the aggregated cells — cross-sheet refs pass the
    /// *referenced* sheet's index so each argument excludes its own sheet's
    /// hidden rows. Returns `None` when the host pushed no hidden rows for
    /// that sheet (or `sheet_index` is `None`). The engine never models
    /// hidden state or infers its source (manual vs filter); this is pure
    /// read-only evaluation input.
    ///
    /// Workbook-backed live providers do a *tracked* read of the
    /// `hidden_epoch` atom inside this method, so a `set_eval_hidden_rows`
    /// push precisely re-derives the 101-111 formulas that consumed it.
    /// Function numbers 1-11 never call this, hold no such edge, and are
    /// therefore left undisturbed by a hidden-set change.
    fn hidden_rows(&self, _sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        None
    }

    /// Host-pushed per-sheet FILTER-hidden row set
    /// (`design-filter-hidden-rows` §6.2). Same shape and per-argument
    /// sheet-resolution contract as `hidden_rows`, but a SEPARATE source: Excel
    /// excludes filter-hidden rows from BOTH SUBTOTAL layers (1-11 and
    /// 101-111), while manually hidden rows are excluded only by 101-111. A
    /// merged set could not express that rule, so the engine keeps two
    /// independent read-only inputs and still models no hidden state of its
    /// own.
    ///
    /// Workbook-backed live providers do a *tracked* read of the
    /// `filter_hidden_epoch` atom (distinct from the manual one) inside this
    /// method, so a `set_eval_filter_hidden_rows` push re-derives both layers
    /// while a manual push leaves the 1-11 formulas alone.
    fn filter_hidden_rows(&self, _sheet_index: Option<usize>) -> Option<Rc<HashSet<u32>>> {
        None
    }

    // ===== EVAL_PROVIDER TRAIT METHODS: ADD NEW METHODS BEFORE THIS LINE =====
    // Sentinel for parallel-agent merges — when a new feature needs a new
    // EvalProvider hook, add it BEFORE this marker (with a sensible default)
    // and update the provider impls in sheet.rs / workbook.rs separately.
}
