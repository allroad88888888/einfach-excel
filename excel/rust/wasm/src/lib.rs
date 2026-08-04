//! WASM binding orchestration.
//!
//! Wire DTOs, listeners, binding exports, and tests live in cohesive
//! `wasm_*` source fragments. They are included in this lexical module so
//! wasm-bindgen sees the same private implementation context as before.

use einfach_core::{CellListener, Value, ValueError};
use einfach_excel_core::{
    Align, BorderSpec, BorderStyle, CellAddress, CellBorders, CellFormat, CellRange,
    CellSubscription, ColumnFilterRule, CustomFunctionRegistry, DepGraphStats, FilterApplyReport,
    FilterError, FilterSnapshot, FormatRangeSnapshot, HiddenRowsSnapshot, NumberFormat,
    RangeFormatSnapshotLayer, Rotation, Sheet, SheetError, SheetFilterState, SheetHiddenRows,
    SortDirection, SortKey, SortRangeError, SortRangeReport, TableEntry, TableError,
    TableRegistrySnapshot, TotalsFunction, VerticalAlign, Workbook, WorkbookError,
    MAX_FILTER_PREDICATE_CELLS,
};
use einfach_excel_core::{
    AutoFillDirection, AutoFillError, AutoFillListWitness, AutoFillReport, AutoFillRequest,
    AutoFillSeries, AutoFillTextPattern,
};
use serde::{de, Deserialize, Serialize};
use std::cell::Cell;
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use wasm_bindgen::prelude::*;
#[cfg(target_arch = "wasm32")]
use wasm_bindgen::JsCast;

include!("wasm_autofill_wire.rs");
include!("wasm_cell_format_wire.rs");
include!("wasm_format_snapshot_wire.rs");
include!("wasm_import_value_wire.rs");
include!("wasm_import_cells_wire.rs");
include!("wasm_bulk_wire.rs");
include!("wasm_sort_wire.rs");
include!("wasm_table_wire.rs");
include!("wasm_filter_wire.rs");
include!("wasm_listener.rs");

/// WASM-exposed spreadsheet. Wraps the Rust Sheet.
#[wasm_bindgen]
pub struct WasmSheet {
    sheet: Sheet,
    /// Active subscriptions, keyed by an opaque token id we hand back to JS.
    /// Sheet owns the address-level rewiring when a cell switches between
    /// primitive and formula atoms.
    subscriptions: HashMap<u32, CellSubscription>,
    next_token: u32,
}

include!("wasm_sheet_cells.rs");
include!("wasm_sheet_format.rs");

include!("wasm_workbook_subscriptions.rs");
include!("wasm_custom_registry.rs");
include!("wasm_custom_invoke.rs");
include!("wasm_custom_value.rs");
include!("wasm_custom_array.rs");

/// WASM-exposed workbook. Wraps the Rust Workbook so browser demos can
/// evaluate formulas through workbook context, including cross-sheet refs.
#[wasm_bindgen]
pub struct WasmWorkbook {
    workbook: Workbook,
    /// Workbook-level ownership for opaque JS subscription tokens. Each entry
    /// points at an underlying stable-facade subscription; cross-sheet
    /// reactivity reaches that facade through the shared Store graph. The
    /// retained sheet index exists only for unsubscribe and topology remap.
    subscriptions: HashMap<u32, WorkbookCellSubscription>,
    next_token: u32,
    /// Wave 8 custom-formula registry handle. The same `Arc` is installed
    /// on the inner `Workbook` so the formula engine can reach the JS
    /// callbacks via `WorkbookEvalProvider::call_custom`. We keep a
    /// second handle here so `register_custom_formula` /
    /// `unregister_custom_formula` can mutate the map without going
    /// through the workbook's borrow.
    custom_formulas: Arc<WasmCustomFormulaRegistry>,
    /// Phase timings recorded by the most recent
    /// `bulk_import_cells_instrumented` call. `None` until the host calls
    /// the instrumented variant at least once. Stored as a flat
    /// `[f64; 12]` rather than a struct so the wasm-bindgen exposure can
    /// reach it via the simple `Vec<f64>` accessor below — no extra
    /// `serde` wire type needed for a one-shot debug surface.
    ///
    /// Layout (matches `debug_last_bulk_import_phase_ms` doc):
    ///   [0]  cell_count
    ///   [1]  formula_count
    ///   [2]  rpc_deserialize_ms
    ///   [3]  parse_only_ms
    ///   [4]  set_cell_loop_ms
    ///   [5]  set_formula_loop_ms
    ///   [6]  flush_ms
    ///   [7]  engine_total_ms
    ///   [8]  flush_parse_ms          (Phase 1 sub-slice of [6])
    ///   [9]  flush_dep_extract_ms    (Phase 1 sub-slice of [6])
    ///   [10] flush_dep_register_ms   (Phase 1 sub-slice of [6])
    ///   [11] flush_formula_record_ms (Phase 1 sub-slice of [6])
    last_bulk_import_phase_ms: Cell<Option<[f64; 12]>>,
}

include!("wasm_workbook_topology.rs");
include!("wasm_workbook_tables.rs");
include!("wasm_workbook_visibility.rs");
include!("wasm_workbook_table_totals.rs");
include!("wasm_workbook_writes.rs");
include!("wasm_workbook_spills_subscriptions.rs");
include!("wasm_workbook_custom.rs");
include!("wasm_workbook_import.rs");
include!("wasm_workbook_bulk_install.rs");
include!("wasm_workbook_instrumentation.rs");
include!("wasm_workbook_diagnostics.rs");
include!("wasm_workbook_autofill_format.rs");
include!("wasm_workbook_viewport_persistence.rs");

impl Default for WasmWorkbook {
    fn default() -> Self {
        Self::new()
    }
}

include!("wasm_workbook_helpers.rs");
include!("wasm_workbook_persistence_helpers.rs");

include!("wasm_sparse_install.rs");
include!("wasm_write_errors.rs");
include!("wasm_error_wires.rs");
include!("wasm_value_display.rs");

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(target_arch = "wasm32")]
    wasm_bindgen_test::wasm_bindgen_test_configure!(run_in_browser);

    include!("wasm_tests/custom.rs");
    include!("wasm_tests/tables.rs");
    include!("wasm_tests/hidden_rows.rs");
    include!("wasm_tests/filters_support.rs");
    include!("wasm_tests/filters_persistence.rs");
    include!("wasm_tests/filters_wire_contract.rs");
    include!("wasm_tests/table_restore.rs");
    include!("wasm_tests/sort_and_sheet.rs");
    include!("wasm_tests/workbook_sparse.rs");
    include!("wasm_tests/persistence_roundtrip.rs");
    include!("wasm_tests/persistence_validation.rs");
    include!("wasm_tests/diagnostics.rs");
}
