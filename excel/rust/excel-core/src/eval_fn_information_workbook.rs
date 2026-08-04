//! Dispatches information workbook formula functions.

use super::*;

pub(super) fn eval_fn_information_workbook(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "CELL" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // info_type must be Text — non-text args (numbers, bools) hit
            // WrongType rather than coercing, so spreadsheets surface the
            // type mismatch loudly.
            let info_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = info_v {
                return Value::Error(e);
            }
            let info_type = match &info_v {
                Value::Text(s) => s.to_ascii_lowercase(),
                _ => return Value::Error(ValueError::WrongType),
            };

            // Resolve the target address. With an explicit second arg, only
            // direct cell/range references qualify; computed values (e.g.
            // CELL("address","not-a-ref")) yield #TYPE!. Multi-cell ranges
            // collapse to their top-left cell per Excel parity.
            let addr: CellAddress = if args.len() == 2 {
                match &args[1] {
                    Expr::CellRef(a, _) | Expr::SheetRef { addr: a, .. } => *a,
                    Expr::Range { start, .. } | Expr::SheetRange { start, .. } => *start,
                    _ => return Value::Error(ValueError::WrongType),
                }
            } else {
                match provider.current_cell() {
                    Some(a) => a,
                    // note: AtomEvalProvider doesn't carry current-cell, so
                    // the no-arg unit tests below land here. The production
                    // workbook path is covered by tests/cell_function.rs.
                    None => return Value::Error(ValueError::InvalidRef),
                }
            };
            if addr.row == REF_INVALID_ROW || addr.col == REF_INVALID_COL {
                return Value::Error(ValueError::InvalidRef);
            }

            match info_type.as_str() {
                "address" => {
                    let mut address = String::new();
                    crate::cell::push_abs_addr(&mut address, addr, true, true);
                    Value::Text(address)
                }
                "row" => Value::Number((addr.row + 1) as f64),
                // Excel accepts both "col" and "column" for the column index.
                "col" | "column" => Value::Number((addr.col + 1) as f64),
                "contents" => provider.cell(addr),
                "type" => match provider.cell(addr) {
                    Value::Null => Value::Text("b".into()),
                    Value::Text(_) => Value::Text("l".into()),
                    // Excel collapses numbers, booleans, and errors to "v".
                    _ => Value::Text("v".into()),
                },
                "prefix" => match provider.cell(addr) {
                    // Excel returns the actual alignment-prefix character;
                    // we only know whether the cell is text, so we
                    // approximate: text → "'", everything else → "".
                    Value::Text(_) => Value::Text("'".into()),
                    _ => Value::Text(String::new()),
                },
                // Excel's CELL("width") reports the column width in CHARACTER
                // units (how many default-font digits fit), "rounded off to an
                // integer" per the Microsoft docs. We store widths in physical
                // pixels, so we invert the standard Excel px↔char metric:
                //
                //     chars = round((pixels − 5) / MDW)
                //
                // where MDW = 7 is Calibri-11's Maximum Digit Width and 5 px is
                // the cell's left+right padding baked into the stored box width.
                // Calibration: Excel's default 64 px → (64−5)/7 = 8.43 → 8;
                // e.g. 100 px → (100−5)/7 = 13.57 → 14. `round` (half away from
                // zero) matches the docs' "rounded off", not truncation; the
                // result is clamped at 0 so a sub-padding width can't go
                // negative. Columns with no explicit width report `None` here
                // and fall back to Excel's default of 8 characters.
                //
                // Modern Excel returns a 2-element spill array {width, is_default};
                // we return the scalar integer (legacy shape) to match this
                // engine's existing CELL return contract and stay backward
                // compatible. Cross-sheet refs collapse to the current sheet's
                // widths — same limitation the content-touching info_types
                // ("contents"/"type"/"prefix") already carry.
                "width" => {
                    let chars = match provider.col_width(addr.col) {
                        Some(px) => (((px as f64) - 5.0) / 7.0).round().max(0.0),
                        None => 8.0,
                    };
                    Value::Number(chars)
                }
                // note: per-cell locked/unlocked state lives outside the
                // formula engine — we report "locked" (1) for every cell.
                "protect" => Value::Number(1.0),
                _ => Value::Error(ValueError::InvalidValue),
            }
        }

        // === Database functions (D*) ===
        //
        // Shared signature: D*(database, field, criteria).
        //   - database: range with a header row (row 0) and N data rows.
        //   - field: column header (Text, case-insensitive) OR 1-based
        //     column index (Number).
        //   - criteria: range with a header row + 1+ criterion rows; rows
        //     OR-combine, non-empty cells within a row AND-combine.
        //
        // Boolean handling: matches Excel — D* aggregates only operate on
        // `Value::Number` data cells. Booleans / text / nulls are skipped
        // for DCOUNT/DSUM/DAVERAGE/DSTDEV*/DVAR*/DPRODUCT/DMAX/DMIN. DCOUNTA
        // counts ANY non-Null cell (numeric, text, boolean).
        //
        // Error propagation: any cell in `database` or `criteria` that
        // holds `Value::Error(_)` short-circuits to that error.
        //
        // Empty-match handling (per Excel parity):
        //   - DAVERAGE, DSTDEV/DSTDEVP, DVAR/DVARP → #DIV/0!
        //   - DSUM, DPRODUCT, DMAX, DMIN, DCOUNT, DCOUNTA → 0
        //   - DGET 0 matches → #VALUE!, > 1 matches → #NUM!
        "ISFORMULA" => fn_isformula(args, provider),
        "SHEET" => fn_sheet(args, provider),
        "SHEETS" => fn_sheets(args, provider),
        "INFO" => fn_info(args, provider),
        _ => unreachable!(),
    }
}
