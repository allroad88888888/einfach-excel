//! Workbook orchestration facade.
//!
//! This file owns the public `Workbook` state.  Cohesive operations live in
//! the adjacent `workbook_*.rs` family so source-level architecture checks
//! can cover the complete implementation without accepting one mega-module.

use std::cell::Cell;
use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::rc::Rc;
use std::sync::Arc;

use einfach_core::{AtomId, Store, Value, ValueError};

use crate::cell::CellAddress;
use crate::eval::{
    eval_expr_with_provider, is_builtin_function_name, CustomFunctionRegistry, EvalProvider,
    ExcelLambda, ResolvedTable,
};
use crate::filter::{ColumnFilterRule, FilterApplyReport, FilterError};
use crate::formula::{parse_formula, Expr, RangeBounds, TableArea};
use crate::range::CellRange;
use crate::sheet::{
    expr_may_produce_array, BulkInstallCleanup, PendingAsyncCustomCall, ProjectedTable, Sheet,
    SheetError, WorkbookAtomContext,
};

#[path = "workbook_bulk.rs"]
mod workbook_bulk;
#[path = "workbook_bulk_types.rs"]
mod workbook_bulk_types;
#[path = "workbook_conditional_format.rs"]
mod workbook_conditional_format;
#[path = "workbook_conditional_format_types.rs"]
mod workbook_conditional_format_types;
#[path = "workbook_custom.rs"]
mod workbook_custom;
#[path = "workbook_cycles.rs"]
mod workbook_cycles;
#[path = "workbook_errors.rs"]
mod workbook_errors;
#[path = "workbook_eval_provider.rs"]
mod workbook_eval_provider;
#[path = "workbook_filter_engine.rs"]
mod workbook_filter_engine;
#[path = "workbook_filter_rules.rs"]
mod workbook_filter_rules;
#[path = "workbook_hidden_rows.rs"]
mod workbook_hidden_rows;
#[path = "workbook_initialization.rs"]
mod workbook_initialization;
#[path = "workbook_loader.rs"]
mod workbook_loader;
#[path = "workbook_named.rs"]
mod workbook_named;
#[path = "workbook_names.rs"]
mod workbook_names;
#[path = "workbook_print_config.rs"]
mod workbook_print_config;
#[path = "workbook_read.rs"]
mod workbook_read;
#[path = "workbook_sheet_archive.rs"]
mod workbook_sheet_archive;
#[path = "workbook_sheet_removal.rs"]
mod workbook_sheet_removal;
pub use workbook_sheet_archive::ArchivedWorksheet;
#[path = "workbook_sheet_history.rs"]
mod workbook_sheet_history;
pub(crate) use workbook_sheet_history::SheetHistoryChange;
#[path = "workbook_structural.rs"]
mod workbook_structural;
#[path = "workbook_structural_history.rs"]
mod workbook_structural_history;
#[path = "workbook_structural_preflight.rs"]
mod workbook_structural_preflight;
pub(crate) use workbook_structural_history::StructuralHistoryChange;
#[path = "workbook_history_restore.rs"]
mod workbook_history_restore;
#[path = "workbook_sheet_edit.rs"]
mod workbook_sheet_edit;
#[path = "workbook_sheet_refs.rs"]
mod workbook_sheet_refs;
#[path = "workbook_table_geometry.rs"]
mod workbook_table_geometry;
#[path = "workbook_table_registry.rs"]
mod workbook_table_registry;
#[path = "workbook_table_restore.rs"]
mod workbook_table_restore;
#[path = "workbook_table_totals.rs"]
mod workbook_table_totals;
#[path = "workbook_table_types.rs"]
mod workbook_table_types;
#[path = "workbook_topology.rs"]
mod workbook_topology;
pub(crate) use workbook_sheet_refs::rewrite_sheet_refs;
#[path = "workbook_input.rs"]
mod workbook_input;
#[path = "workbook_merge.rs"]
mod workbook_merge;
#[path = "workbook_visibility_types.rs"]
mod workbook_visibility_types;
#[path = "workbook_write.rs"]
mod workbook_write;
pub use workbook_merge::MergeAction;

pub(crate) use self::workbook_bulk_types::CustomCallScope;
pub use self::workbook_bulk_types::{BulkInstallStats, InstallError};
pub use self::workbook_conditional_format_types::{
    ConditionalFormatConfigSnapshot, ConditionalFormatError, ConditionalFormatRuleEntry,
};
pub use self::workbook_errors::{HiddenRowsError, TableError, TotalsFunction};
pub use self::workbook_loader::WorkbookLoader;
pub use self::workbook_named::WorkbookError;
pub use self::workbook_print_config::{
    HeaderFooterFields, ManualPageBreak, ManualPageBreakAxis, PrintConfig, PrintConfigError,
    PrintConfigSnapshot, PrintOrientation, PrintScale,
};
pub use self::workbook_table_types::{TableEntry, TableRegistrySnapshot};
pub use self::workbook_visibility_types::{
    FilterSnapshot, HiddenRowsSnapshot, SheetFilterState, SheetHiddenRows, SheetVisibility,
};

use self::workbook_eval_provider::WorkbookEvalProvider;
use self::workbook_named::*;
use self::workbook_table_geometry::*;

/// An ordered collection of named sheets sharing one dependency store.
pub struct Workbook {
    pub(super) store: Store,
    pub(super) atom_context: Rc<WorkbookAtomContext>,
    pub(super) sheets: Vec<Sheet>,
    sheet_keys: Vec<u64>,
    next_sheet_key: u64,
    pub(super) names: Vec<String>,
    pub(super) by_name: HashMap<String, usize>,
    pub(super) cycle_ast_walk_count: Cell<usize>,
    pub(super) named_values: BTreeMap<String, NamedEntry>,
    pub(super) custom_functions: Option<Arc<dyn CustomFunctionRegistry>>,
    pub(crate) custom_call_depth: Rc<Cell<usize>>,
    pub(super) content_revision: u64,
    pub(super) tables: BTreeMap<String, TableEntry>,
    pub(super) tables_epoch: u64,
    print_configs: Vec<workbook_print_config::SheetPrintConfig>,
    conditional_formats: Vec<workbook_conditional_format_types::SheetConditionalFormatConfig>,
}

#[cfg(test)]
#[path = "workbook_tests/async_custom.rs"]
mod workbook_tests_async_custom;
#[cfg(test)]
#[path = "workbook_tests/basics.rs"]
mod workbook_tests_basics;
#[cfg(test)]
#[path = "workbook_tests/conditional_format.rs"]
mod workbook_tests_conditional_format;
#[cfg(test)]
#[path = "workbook_tests/custom.rs"]
mod workbook_tests_custom;
#[cfg(test)]
#[path = "workbook_tests/dependencies.rs"]
mod workbook_tests_dependencies;
#[cfg(test)]
#[path = "workbook_tests/mutation.rs"]
mod workbook_tests_mutation;
#[cfg(test)]
#[path = "workbook_tests/print_config.rs"]
mod workbook_tests_print_config;
#[cfg(test)]
#[path = "workbook_tests/read_boundary.rs"]
mod workbook_tests_read_boundary;
#[cfg(test)]
#[path = "workbook_tests/topology.rs"]
mod workbook_tests_topology;
