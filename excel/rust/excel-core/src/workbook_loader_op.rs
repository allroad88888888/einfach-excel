//! Typed operations retained in a workbook bulk-load queue.
use super::{CellAddress, Expr, Value};
use crate::rich_text::RichTextRun;

pub(super) enum WorkbookOp {
    /// Typed address (A-9 follow-up, 2026-06-13 P3): producers parse or
    /// construct the `CellAddress` exactly once at the public boundary;
    /// replay routes `BulkLoader::set_cell_at`. Carrying a `String`
    /// here meant one alloc + one re-parse per op in bulk paths whose
    /// producers already hold a typed address (`restore_sparse`).
    SetCell { addr: CellAddress, value: Value },
    SetTextRuns { addr: CellAddress, text: String, runs: Vec<RichTextRun> },
    /// `expr` is `Some` when the workbook-side parse succeeded — the
    /// sheet-side flush installs directly without re-parsing. `None`
    /// covers the parse-failure path: the sheet's `set_formula` sees a
    /// malformed string, writes `#VALUE!`, and never touches the AST.
    /// Eliminating the double-parse was the dominant constant-factor
    /// win for the wasm32 Chain100k bulkWrite tier — `parse_formula`
    /// allocates a `Vec<char>` per source character plus boxed nodes
    /// for every binop / cellref, and was running twice per formula
    /// (workbook + sheet) before this variant. The address is typed
    /// for the same reason as `SetCell`.
    SetFormula {
        addr: CellAddress,
        source: String,
        expr: Option<Expr>,
    },
    /// Typed address — no `String` round-trip (AUDIT A-9). The clear
    /// path's producers (`Workbook::clear_range`'s sparse scan, the
    /// public `clear_cell` after its own parse) always hold a
    /// `CellAddress` already, and the sheet-side replay has a typed
    /// entry (`BulkLoader::set_cell_at`), so carrying a string here
    /// meant one alloc + two parses per cleared cell in a bulk path.
    ClearCell { addr: CellAddress },
}

impl WorkbookOp {
    pub(super) fn addr(&self) -> CellAddress {
        match self {
            WorkbookOp::SetCell { addr, .. } | WorkbookOp::SetFormula { addr, .. }
            | WorkbookOp::ClearCell { addr } | WorkbookOp::SetTextRuns { addr, .. } => *addr,
        }
    }
}

