//! Dispatches lookup modern formula functions.

use super::eval_lookup_range_grid::collect_lookup_range_pair_2d_for_args;
use super::*;

pub(super) fn eval_fn_lookup_modern(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "XLOOKUP" => {
            if args.len() < 3 || args.len() > 6 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let needle = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = needle {
                return Value::Error(e);
            }
            // Parse match_mode (default 0).
            let match_mode: i64 = if args.len() >= 5 {
                let mv = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = mv {
                    return Value::Error(e);
                }
                match coerce_to_number(&mv) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                0
            };
            if !matches!(match_mode, -1 | 0 | 1 | 2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // Parse search_mode (default 1).
            let search_mode: i64 = if args.len() == 6 {
                let sv = eval_expr_with_provider(&args[5], provider);
                if let Value::Error(e) = sv {
                    return Value::Error(e);
                }
                match coerce_to_number(&sv) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            if !matches!(search_mode, -2 | -1 | 1 | 2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // Wildcard match cannot use binary search (no ordering of patterns).
            if match_mode == 2 && (search_mode == 2 || search_mode == -2) {
                return Value::Error(ValueError::InvalidValue);
            }
            // For wildcard mode, the needle MUST be text.
            if match_mode == 2 && !matches!(needle, Value::Text(_)) {
                return Value::Error(ValueError::WrongType);
            }
            // Both arrays must be ranges (lookup and return). Same linear
            // cell count required.
            let (lookup_grid, return_grid) =
                match collect_lookup_range_pair_2d_for_args(&args[1], &args[2], provider) {
                    Some(grids) => grids,
                    None => return Value::Error(ValueError::InvalidValue),
                };
            let lookup_flat: Vec<Value> = lookup_grid
                .into_iter()
                .flat_map(|r| r.into_iter())
                .collect();
            let return_flat: Vec<Value> = return_grid
                .into_iter()
                .flat_map(|r| r.into_iter())
                .collect();
            if lookup_flat.len() != return_flat.len() || lookup_flat.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            // Propagate any error cell inside lookup_array (per existing
            // behavior).
            for k in lookup_flat.iter() {
                if let Value::Error(e) = k {
                    return Value::Error(e.clone());
                }
            }
            let n = lookup_flat.len();
            // Helper: produce the not-found fallback.
            // `if_not_found` 没传、或写成空占位 `,,` ⇒ `#N/A`。
            //
            // ⚠️ 指向空格的引用（`=XLOOKUP(0,F1:F5,G1:G5,Z99,-1)`）**不**
            // 走这条：那是提供了一个空值，原样交出去。TS 引擎在这里按值判
            // （`fallback.kind === 'blank'` 也给 `#N/A`），是一条已知分歧，
            // 钉在 `cross-engine-parity-omitted-args.test.ts`。取舍理由见
            // `arg_is_omitted`。
            let not_found = |this_args: &[Expr]| -> Value {
                match this_args.get(3).filter(|a| !arg_is_omitted(a)) {
                    Some(fallback_expr) => eval_expr_with_provider(fallback_expr, provider),
                    None => Value::Error(ValueError::NotAvailable),
                }
            };

            // Compute the index of the matching cell (if any) given the mode
            // combination.
            let found: Option<usize> = match (match_mode, search_mode) {
                // --- Exact match -----------------------------------------
                (0, 1) => lookup_flat.iter().position(|k| values_equal(k, &needle)),
                (0, -1) => lookup_flat.iter().rposition(|k| values_equal(k, &needle)),
                (0, 2) => {
                    // Binary search ascending for the first exact match.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(_) => None,
                    }
                }
                (0, -2) => {
                    // Binary search descending: reverse the comparator.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(_) => None,
                    }
                }
                // --- Approximate next-smaller (-1) -----------------------
                (-1, 1) | (-1, -1) => {
                    // Linear scan: prefer exact; otherwise pick the largest
                    // key still <= needle. Direction (forward / reverse)
                    // only affects which equal candidate wins, but values
                    // equal under `compare_lookup` are returned eagerly the
                    // first time exact is detected, so behavior is the
                    // same. We still respect direction for the "best ≤"
                    // tie-break: forward keeps the first qualifying index,
                    // reverse keeps the last.
                    let mut best: Option<(usize, &Value)> = None;
                    let iter: Box<dyn Iterator<Item = (usize, &Value)>> = if search_mode == 1 {
                        Box::new(lookup_flat.iter().enumerate())
                    } else {
                        Box::new(lookup_flat.iter().enumerate().rev())
                    };
                    let mut exact: Option<usize> = None;
                    for (i, k) in iter {
                        if values_equal(k, &needle) {
                            exact = Some(i);
                            break;
                        }
                        if compare_lookup(k, &needle).is_lt() {
                            match best {
                                None => best = Some((i, k)),
                                Some((_, prev)) => {
                                    if compare_lookup(k, prev).is_gt() {
                                        best = Some((i, k));
                                    }
                                }
                            }
                        }
                    }
                    exact.or(best.map(|(i, _)| i))
                }
                (-1, 2) => {
                    // Ascending binary search for exact-or-next-smaller.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // Insertion point: everything below i is < needle.
                            if i == 0 {
                                None
                            } else {
                                Some(i - 1)
                            }
                        }
                    }
                }
                (-1, -2) => {
                    // Descending binary search for exact-or-next-smaller.
                    // In a descending array, the first element <= needle is
                    // the insertion point.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            if i >= n {
                                None
                            } else {
                                Some(i)
                            }
                        }
                    }
                }
                // --- Approximate next-larger (1) -------------------------
                (1, 1) | (1, -1) => {
                    let mut best: Option<(usize, &Value)> = None;
                    let iter: Box<dyn Iterator<Item = (usize, &Value)>> = if search_mode == 1 {
                        Box::new(lookup_flat.iter().enumerate())
                    } else {
                        Box::new(lookup_flat.iter().enumerate().rev())
                    };
                    let mut exact: Option<usize> = None;
                    for (i, k) in iter {
                        if values_equal(k, &needle) {
                            exact = Some(i);
                            break;
                        }
                        if compare_lookup(k, &needle).is_gt() {
                            match best {
                                None => best = Some((i, k)),
                                Some((_, prev)) => {
                                    if compare_lookup(k, prev).is_lt() {
                                        best = Some((i, k));
                                    }
                                }
                            }
                        }
                    }
                    exact.or(best.map(|(i, _)| i))
                }
                (1, 2) => {
                    // Ascending binary search for exact-or-next-larger.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(probe, &needle)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // Insertion point: everything at i and above is
                            // >= needle. So index i is the next-larger.
                            if i >= n {
                                None
                            } else {
                                Some(i)
                            }
                        }
                    }
                }
                (1, -2) => {
                    // Descending binary search for exact-or-next-larger.
                    match lookup_flat.binary_search_by(|probe| compare_lookup(&needle, probe)) {
                        Ok(i) => Some(i),
                        Err(i) => {
                            // In a descending array, the element just before
                            // the insertion point is the smallest one still
                            // >= needle.
                            if i == 0 {
                                None
                            } else {
                                Some(i - 1)
                            }
                        }
                    }
                }
                // --- Wildcard (text-only) --------------------------------
                (2, 1) => {
                    let pattern = coerce_to_text(&needle);
                    lookup_flat
                        .iter()
                        .position(|k| wildcard_match(&pattern, &coerce_to_text(k)))
                }
                (2, -1) => {
                    let pattern = coerce_to_text(&needle);
                    lookup_flat
                        .iter()
                        .rposition(|k| wildcard_match(&pattern, &coerce_to_text(k)))
                }
                // Wildcard + binary excluded above; any other mode pair was
                // already rejected. Catch-all defensively.
                _ => return Value::Error(ValueError::InvalidValue),
            };
            match found {
                Some(i) => return_flat[i].clone(),
                None => not_found(args),
            }
        }

        // HOUR(serial) — extract hour 0..23 from fractional-day serial.
        // Uses only the fractional part of the serial. For negative serials
        // we add 1 so the fraction is always in [0, 1).
        "XMATCH" => fn_xmatch(args, provider),

        // === T-batch cleanup arms (Q1 2026) ===
        //
        // ACOTH(n) — inverse hyperbolic cotangent. `0.5 * ln((n+1)/(n-1))`.
        // Domain: |n| > 1 strictly. At |n| = 1 the argument of `ln` is 0
        // or infinity, both → #NUM!.
        "LOOKUP" => fn_lookup(args, provider),

        // FORMULATEXT(ref) — literal source text of the formula at the
        // referenced cell. Non-formula cell → #N/A; non-ref argument →
        // #VALUE!. Reads through `EvalProvider::cell_formula_text`.
        _ => unreachable!(),
    }
}
