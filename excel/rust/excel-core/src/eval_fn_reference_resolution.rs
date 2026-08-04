//! Dispatches reference resolution formula functions.

use super::*;

pub(super) fn eval_fn_reference_resolution(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "CHOOSE" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let iv = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = iv {
                return Value::Error(e);
            }
            let idx_f = match coerce_to_number(&iv) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            // valid range is 1..=N, where N = args.len() - 1
            if idx_f < 1 || (idx_f as usize) > args.len() - 1 {
                return Value::Error(ValueError::InvalidValue);
            }
            eval_expr_with_provider(&args[idx_f as usize], provider)
        }

        // ADDRESS(row, col[, abs_num=1[, a1=TRUE[, sheet_name=""]]])
        // Build an A1- or R1C1-style address string. `row` / `col` are
        // 1-based; `abs_num` maps 1..=4 to all four absolute/relative
        // permutations.
        "ADDRESS" => {
            if args.len() < 2 || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let row_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = row_v {
                return Value::Error(e);
            }
            let col_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = col_v {
                return Value::Error(e);
            }
            let row = match coerce_to_number(&row_v) {
                Some(n) if n >= 1.0 && n.is_finite() => n.trunc() as i64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let col = match coerce_to_number(&col_v) {
                Some(n) if n >= 1.0 && n.is_finite() => n.trunc() as i64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let abs_num = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1
            };
            if !(1..=4).contains(&abs_num) {
                return Value::Error(ValueError::InvalidValue);
            }
            let a1 = if args.len() >= 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_bool(&v) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                true
            };
            let sheet_prefix = if args.len() == 5 {
                let v = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let s = coerce_to_text(&v);
                if s.is_empty() {
                    String::new()
                } else if s.contains(' ') {
                    format!("'{}'!", s)
                } else {
                    format!("{}!", s)
                }
            } else {
                String::new()
            };

            let body = if a1 {
                // abs_num: 1=$A$1, 2=A$1, 3=$A1, 4=A1
                let (row_abs, col_abs) = match abs_num {
                    1 => (true, true),
                    2 => (true, false),
                    3 => (false, true),
                    4 => (false, false),
                    _ => unreachable!(),
                };
                let mut body = String::new();
                crate::cell::push_abs_addr(
                    &mut body,
                    CellAddress::new((row - 1) as u32, (col - 1) as u32),
                    col_abs,
                    row_abs,
                );
                body
            } else {
                // R1C1: 1=R1C1, 2=R1C[1], 3=R[1]C1, 4=R[1]C[1]
                let (row_abs, col_abs) = match abs_num {
                    1 => (true, true),
                    2 => (true, false),
                    3 => (false, true),
                    4 => (false, false),
                    _ => unreachable!(),
                };
                let row_part = if row_abs {
                    format!("R{}", row)
                } else {
                    format!("R[{}]", row)
                };
                let col_part = if col_abs {
                    format!("C{}", col)
                } else {
                    format!("C[{}]", col)
                };
                format!("{}{}", row_part, col_part)
            };
            Value::Text(format!("{}{}", sheet_prefix, body))
        }

        // INDIRECT(ref_text[, a1=TRUE]) — parse a string into a reference and
        // return the referenced cell's value. A1-style only. Range text
        // resolves to the first (top-left) cell — parity with the OFFSET arm
        // pattern that returns `provider.cell(range.start)` for a
        // multi-cell anchor.
        "INDIRECT" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let ref_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = ref_v {
                return Value::Error(e);
            }
            let a1 = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_bool(&v) {
                    Some(b) => b,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                true
            };
            if !a1 {
                // R1C1 form not yet supported by the parser path; surface
                // #REF! rather than silently picking the wrong cell.
                return Value::Error(ValueError::InvalidRef);
            }
            let text = coerce_to_text(&ref_v);
            match parse_indirect_ref(&text) {
                Some((sheet, start, _end)) => match sheet {
                    Some(s) => provider.sheet_cell(&s, start),
                    None => provider.cell(start),
                },
                None => Value::Error(ValueError::InvalidRef),
            }
        }

        // XLOOKUP(lookup, lookup_array, return_array[, if_not_found[,
        //         match_mode=0[, search_mode=1]]])
        //
        // match_mode:
        //   0  exact (default) — return first/last exact match
        //  -1  exact or next smaller — exact, else largest key <= needle
        //   1  exact or next larger — exact, else smallest key >= needle
        //   2  wildcard (text only) — needle is a wildcard pattern; walk
        //      lookup_array and return the first cell whose text rep matches.
        //
        // search_mode:
        //   1  forward, first-to-last (default)
        //  -1  reverse, last-to-first
        //   2  binary search, ascending-sorted lookup_array
        //  -2  binary search, descending-sorted lookup_array
        //
        // Combination notes:
        // - Wildcard (match_mode=2) requires a linear scan (wildcards have no
        //   ordering), so search_mode must be 1 or -1; ±2 with wildcard
        //   returns #VALUE!.
        // - Approximate (match_mode=±1) with binary (search_mode=±2) is
        //   supported and uses partition_point on the sorted array — O(log n).
        // - Binary search modes ASSUME the array is sorted as advertised; we
        //   do not verify, matching Excel's documented contract. (Caller's
        //   responsibility, per stdlib `binary_search` semantics.)
        "FORMULATEXT" => fn_formulatext(args, provider),

        // ENCODEURL(text) — percent-encode `text` per RFC 3986 unreserved
        // class `[A-Za-z0-9-_.~]`. Everything else encodes as `%XX`
        // (uppercase hex) of each UTF-8 byte.
        _ => unreachable!(),
    }
}
