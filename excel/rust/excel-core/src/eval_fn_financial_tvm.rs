//! Dispatches financial tvm formula functions.

use super::*;

pub(super) fn eval_fn_financial_tvm(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"PMT" => fn_pmt(args, provider),
        "PV" => fn_pv(args, provider),
        "FV" => fn_fv(args, provider),
        "NPER" => fn_nper(args, provider),
        "NPV" => fn_npv(args, provider),
        "IRR" => fn_irr(args, provider),
        "RATE" => fn_rate(args, provider),
        "IPMT" => fn_ipmt(args, provider),
        "PPMT" => fn_ppmt(args, provider),

        // CELL(info_type[, reference]) — return metadata about `reference`.
        //
        // Supported info_type values (Excel matches case-insensitively):
        //   "address"  → $A$1-style absolute text
        //   "row"      → 1-based row number (Number)
        //   "col"/"column" → 1-based column number (Number)
        //   "contents" → the cell's value via provider.cell(addr)
        //   "type"     → "b" blank, "l" text, "v" otherwise
        //   "prefix"   → "'" for text, "" otherwise
        //   "width"    → column width in Excel character units (px→chars)
        //   "protect"  → 1.0 (approximation; per-cell unlock state isn't
        //                tracked at the eval layer)
        // Any other info_type returns #VALUE! (InvalidValue), matching Excel.
        //
        // When `reference` is omitted we fall back to `provider.current_cell()`.
        // The legacy single-sheet `AtomEvalProvider` returns None there, so
        // no-arg `CELL` on that path surfaces #REF! (InvalidRef). The
        // production `WorkbookEvalProvider` tracks the current cell and
        // resolves correctly — covered in tests/cell_function.rs.
                _ => unreachable!(),
    }
}
