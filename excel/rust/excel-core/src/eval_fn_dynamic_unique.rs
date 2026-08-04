//! Dispatches dynamic unique formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_unique(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"UNIQUE" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let by_col = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let exactly_once = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Pull each unit (row or column) into a Vec<Value> for compare.
            let unit = |i: u32| -> Vec<Value> {
                if by_col {
                    (0..rows)
                        .map(|r| data[(r as usize) * (cols as usize) + (i as usize)].clone())
                        .collect()
                } else {
                    (0..cols)
                        .map(|c| data[(i as usize) * (cols as usize) + (c as usize)].clone())
                        .collect()
                }
            };
            let units = if by_col { cols } else { rows };
            // First pass: count duplicates (for `exactly_once`).
            // Element-wise equality on Vec<Value> uses `values_equal`.
            let vec_eq = |a: &Vec<Value>, b: &Vec<Value>| -> bool {
                a.len() == b.len() && a.iter().zip(b.iter()).all(|(x, y)| values_equal(x, y))
            };
            // Build (unique_unit, count) list, preserving first-seen order.
            let mut buckets: Vec<(Vec<Value>, u32)> = Vec::new();
            for i in 0..units {
                let u = unit(i);
                if let Some(slot) = buckets.iter_mut().find(|(b, _)| vec_eq(b, &u)) {
                    slot.1 += 1;
                } else {
                    buckets.push((u, 1));
                }
            }
            // Filter per `exactly_once`.
            let keep: Vec<&Vec<Value>> = buckets
                .iter()
                .filter(|(_, c)| if exactly_once { *c == 1 } else { true })
                .map(|(u, _)| u)
                .collect();
            if keep.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            // Re-assemble.
            if by_col {
                // Output shape: rows × keep.len()
                let out_cols = keep.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity((rows as usize) * keep.len());
                for r in 0..rows {
                    for u in &keep {
                        out.push(u[r as usize].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
            } else {
                let out_rows = keep.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity(keep.len() * (cols as usize));
                for u in &keep {
                    out.extend(u.iter().cloned());
                }
                Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
            }
        }

        // SORT(array[, sort_index[, sort_order[, by_col]]]) — Sort rows by
        // column `sort_index` (default 1) ascending (1) or descending (-1).
        // When `by_col=TRUE`, sort columns by row `sort_index` instead.
                _ => unreachable!(),
    }
}
