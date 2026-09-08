use std::cell::{Cell, RefCell};
use std::cmp::Ordering;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::hash::Hash;
use std::rc::{Rc, Weak};

use std::sync::Arc;

use einfach_core::{
    ArrayData, AtomFamily, AtomId, CellListener, ReadArgs, Store, SubscriptionId, Value, ValueError,
};

use crate::cell::CellAddress;
use crate::cell_style::CellStyle;
use crate::eval::{eval_expr_with_provider, CustomFunctionRegistry, EvalProvider, ResolvedTable};
use crate::format::{apply_rules, CellFormat, ConditionalRule};
use crate::formula::{parse_formula, Expr, RangeBounds};
use crate::range::CellRange;

// Dynamic-array spill lives in three child modules rather than in this file:
// `spill` owns the *installed* projection state (the bookkeeping tables
// declared on `Sheet` below, plus install / teardown), `spill_claims` owns the
// BLOCKED side (anchors currently projecting `#SPILL!` and the rectangle they
// would have owned), `spill_maintenance` owns the re-projection triggers, and
// `spill_blocker` answers the one diagnostic question those three do not —
// which cell is blocking a given `#SPILL!`. They are children of `sheet`, not
// siblings in `lib.rs`, so they keep reading `Sheet`'s private fields and
// helpers without anything being widened — `pub(super)` there spans exactly
// what plain `fn` spanned here. `#[path]` keeps all four files flat in `src/`.
#[path = "sheet_spill.rs"]
mod spill;
#[path = "sheet_spill_blocker.rs"]
mod spill_blocker;
#[path = "sheet_spill_claims.rs"]
mod spill_claims;
#[path = "sheet_spill_maintenance.rs"]
mod spill_maintenance;
#[path = "sheet_state.rs"]
mod state;

// 生产代码按职责拆到下面这些子模块里（`#[path]` 让文件在 `src/` 下保持扁平，
// 与既有的 `sheet_spill*.rs` 同一套做法）。它们是 `sheet` 的子模块，因此
// 照旧读得到 `Sheet` 的私有字段；原先的私有项在那边写成 `pub(super)`。
#[path = "sheet_array_gate.rs"]
mod array_gate;
#[path = "sheet_async_custom.rs"]
mod async_custom;
#[path = "sheet_atom_formula_provider.rs"]
mod atom_formula_provider;
#[path = "sheet_atom_gc.rs"]
mod atom_gc;
#[path = "sheet_batch.rs"]
mod batch;
#[path = "sheet_bulk_formula.rs"]
mod bulk_formula;
#[path = "sheet_bulk_install.rs"]
mod bulk_install;
#[path = "sheet_bulk_loader.rs"]
mod bulk_loader;
#[path = "sheet_bulk_parsed.rs"]
mod bulk_parsed;
#[path = "sheet_cell_slot.rs"]
mod cell_slot;
#[path = "sheet_cycle_detection.rs"]
mod cycle_detection;
#[path = "sheet_debug_atoms.rs"]
mod debug_atoms;
#[path = "sheet_debug_deps.rs"]
mod debug_deps;
#[path = "sheet_dependency_graph.rs"]
mod dependency_graph;
#[path = "sheet_dimensions.rs"]
mod dimensions;
#[path = "sheet_error.rs"]
mod error;
#[path = "sheet_eval_provider.rs"]
mod eval_provider;
#[path = "sheet_expr_refs.rs"]
mod expr_refs;
#[path = "sheet_facade.rs"]
mod facade;
#[path = "sheet_facade_context.rs"]
mod facade_context;
#[path = "sheet_facade_range_context.rs"]
mod facade_range_context;
#[path = "sheet_filter.rs"]
mod filter;
#[path = "sheet_format.rs"]
mod format;
#[path = "sheet_format_snapshot.rs"]
mod format_snapshot;
#[path = "sheet_format_write.rs"]
mod format_write;
#[path = "sheet_formula_state.rs"]
mod formula_state;
#[path = "sheet_hidden_rows.rs"]
mod hidden_rows;
#[path = "sheet_hidden_columns.rs"]
mod hidden_columns;
#[path = "sheet_history_budget.rs"]
mod history_budget;
pub(crate) use history_budget::metadata_bytes;
#[path = "sheet_hydrate.rs"]
mod hydrate;
#[path = "sheet_in_flight.rs"]
mod in_flight;
#[path = "sheet_interior.rs"]
mod interior;
#[path = "sheet_lifecycle.rs"]
mod lifecycle;
#[path = "sheet_range_tiers.rs"]
mod range_tiers;
#[path = "sheet_read.rs"]
mod read;
#[path = "sheet_relocate.rs"]
mod relocate;
#[path = "sheet_retarget.rs"]
mod retarget;
#[path = "sheet_cross_sheet_shift.rs"]
mod cross_sheet_shift;
#[path = "sheet_row_major_map.rs"]
mod row_major_map;
#[path = "sheet_scan.rs"]
mod scan;
#[path = "sheet_structural.rs"]
mod structural;
#[path = "sheet_subscribe.rs"]
mod subscribe;
#[path = "sheet_workbook_async_context.rs"]
mod workbook_async_context;
#[path = "sheet_workbook_context.rs"]
mod workbook_context;
#[path = "sheet_workbook_hidden_context.rs"]
mod workbook_hidden_context;
#[path = "sheet_workbook_sync_context.rs"]
mod workbook_sync_context;
#[path = "sheet_workbook_topology.rs"]
mod workbook_topology;
#[path = "sheet_write_clear.rs"]
mod write_clear;
#[path = "sheet_write_formula.rs"]
mod write_formula;
#[path = "sheet_write_value.rs"]
mod write_value;

use self::async_custom::*;
use self::atom_formula_provider::*;
use self::cell_slot::*;
use self::eval_provider::*;
use self::expr_refs::*;
use self::facade_context::*;
use self::formula_state::*;
use self::hidden_rows::*;
use self::in_flight::*;
use self::interior::*;
use self::range_tiers::*;
use self::row_major_map::*;
use self::scan::*;
use self::subscribe::*;
pub(crate) use self::workbook_context::WorkbookAtomContext;
use self::workbook_topology::*;

pub(crate) use self::array_gate::{expr_may_produce_array, source_may_produce_array};
pub use self::async_custom::PendingAsyncCustomCall;
pub(crate) use self::async_custom::ASYNC_CUSTOM_RESULT_CACHE_CAP;
pub(crate) use self::bulk_install::BulkInstallCleanup;
pub use self::bulk_loader::BulkLoader;
pub use self::debug_deps::DepGraphStats;
pub use self::error::SheetError;
pub(crate) use self::eval_provider::collapse_array_for_eval;
pub use self::format_snapshot::FormatRangeSnapshot;
pub use self::state::Sheet;
pub use self::subscribe::CellSubscription;
pub(crate) use self::workbook_topology::ProjectedTable;

pub(crate) const EXCEL_MAX_ROWS: u32 = 1_048_576;
pub(crate) const EXCEL_MAX_COLS: u32 = 16_384;

impl Default for Sheet {
    fn default() -> Self {
        Self::new()
    }
}

// 单元测试。原来是一个 3,138 行的内联 `mod tests`，现按**被测的东西**拆到
// `sheet_tests/` 下，每个文件一件事。与 `eval_tests/` / `formula/*_tests.rs`
// 同一个约定：`#[path]` 挂在实现文件上，`tests` 仍是 `sheet` 的子模块，因此
// 拿得到本模块的私有项。
#[cfg(test)]
#[path = "sheet_tests/mod.rs"]
mod tests;
