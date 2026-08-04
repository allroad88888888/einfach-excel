//! Dispatches reference position formula functions.

use super::*;

pub(super) fn eval_fn_reference_position(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"OFFSET" => {
            if args.len() < 3 || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match eval_offset_as_range(args, provider) {
                Some(r) => {
                    let start = r.range.normalize().start;
                    match &r.sheet {
                        Some(sheet) => provider.sheet_cell(sheet, start),
                        None => provider.cell(start),
                    }
                }
                None => Value::Error(ValueError::InvalidRef),
            }
        }

        // === B2: extended math ===
        // INT(n) truncates toward -∞ (i.e. floor), so INT(-2.5) = -3.
        "ROW" => {
            if args.len() > 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            if args.is_empty() {
                return provider
                    .current_cell()
                    .map(|a| Value::Number((a.row + 1) as f64))
                    .unwrap_or(Value::Error(ValueError::InvalidRef));
            }
            match &args[0] {
                Expr::CellRef(addr, _) | Expr::SheetRef { addr, .. } => {
                    Value::Number((addr.row + 1) as f64)
                }
                Expr::Range { start, .. } | Expr::SheetRange { start, .. } => {
                    Value::Number((start.row + 1) as f64)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // COLUMN([ref]) — symmetric to ROW; returns the 1-based column number.
        "COLUMN" => {
            if args.len() > 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            if args.is_empty() {
                return provider
                    .current_cell()
                    .map(|a| Value::Number((a.col + 1) as f64))
                    .unwrap_or(Value::Error(ValueError::InvalidRef));
            }
            match &args[0] {
                Expr::CellRef(addr, _) | Expr::SheetRef { addr, .. } => {
                    Value::Number((addr.col + 1) as f64)
                }
                Expr::Range { start, .. } | Expr::SheetRange { start, .. } => {
                    Value::Number((start.col + 1) as f64)
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }

        // ROWS(range) — 1-based count of rows in the supplied range. A single
        // cell is treated as a 1×1 range (height 1).
        "ROWS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match runtime_ref_from_expr(&args[0], provider) {
                Ok(r) => match r.bounded_shape() {
                    Some((rows, _)) => Value::Number(rows as f64),
                    None => Value::Error(ValueError::InvalidValue),
                },
                Err(ValueError::InvalidValue) => Value::Error(ValueError::WrongType),
                Err(e) => Value::Error(e),
            }
        }

        // COLUMNS(range) — symmetric to ROWS.
        "COLUMNS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match runtime_ref_from_expr(&args[0], provider) {
                Ok(r) => match r.bounded_shape() {
                    Some((_, cols)) => Value::Number(cols as f64),
                    None => Value::Error(ValueError::InvalidValue),
                },
                Err(ValueError::InvalidValue) => Value::Error(ValueError::WrongType),
                Err(e) => Value::Error(e),
            }
        }

        // CHOOSE(index, val1, val2, ...) — pick the 1-based indexed argument.
        // `index` is evaluated, coerced to a number, and truncated. Only the
        // selected argument is then evaluated (deferred evaluation parity with
        // Excel's lazy CHOOSE semantics).
        "AREAS" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            match &args[0] {
                Expr::MultiArea(parts) => Value::Number(parts.len() as f64),
                Expr::CellRef(..)
                | Expr::Range { .. }
                | Expr::SheetRef { .. }
                | Expr::SheetRange { .. } => Value::Number(1.0),
                _ => Value::Error(ValueError::WrongType),
            }
        }
        // Asian text-conversion functions. ASC narrows full-width forms to
        // half-width (decomposing voiced/semi-voiced kana into base + mark);
        // JIS / DBCS widen the inverse direction and re-compose dakuten /
        // handakuten sequences. See `asc_convert` / `jis_convert` for the
        // exact mapping tables and the Excel JIS yen-sign quirk
        // (U+FFE5 ￥ decomposes to U+005C backslash, not U+00A5).
                _ => unreachable!(),
    }
}
