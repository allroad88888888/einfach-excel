//! Dispatches dynamic filter formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_filter(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"FILTER" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (irows, icols, idata) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            // include must be either column-vector (irows == rows && icols == 1)
            // OR row-vector (icols == cols && irows == 1).
            let filter_rows: bool;
            if irows == rows && icols == 1 {
                filter_rows = true;
            } else if icols == cols && irows == 1 {
                filter_rows = false;
            } else {
                return Value::Error(ValueError::InvalidValue);
            }
            // Decode include into bool, propagating errors / type mismatches.
            let mut mask: Vec<bool> = Vec::with_capacity(idata.len());
            for v in &idata {
                if let Value::Error(e) = v {
                    return Value::Error(e.clone());
                }
                // Treat Null as FALSE so a sparse include vector silently
                // drops the matching rows/cols (matches Excel behavior).
                if matches!(v, Value::Null) {
                    mask.push(false);
                    continue;
                }
                match coerce_to_bool(v) {
                    Some(b) => mask.push(b),
                    None => return Value::Error(ValueError::WrongType),
                }
            }
            let kept: Vec<usize> = mask
                .iter()
                .enumerate()
                .filter_map(|(i, &b)| if b { Some(i) } else { None })
                .collect();
            if kept.is_empty() {
                if args.len() == 3 {
                    let v = eval_expr_with_provider(&args[2], provider);
                    // Wrap whatever it is in a 1×1 array. Errors flow through
                    // as the array element (Excel parity: =FILTER(...,error)
                    // surfaces the error inside the spill).
                    return Value::Array(Arc::new(ArrayData::new(1, 1, vec![v])));
                }
                return Value::Error(ValueError::Calc);
            }
            if filter_rows {
                let out_rows = kept.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity(kept.len() * (cols as usize));
                for &r in &kept {
                    let base = r * (cols as usize);
                    out.extend(data[base..base + (cols as usize)].iter().cloned());
                }
                Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
            } else {
                let out_cols = kept.len() as u32;
                let mut out: Vec<Value> = Vec::with_capacity((rows as usize) * kept.len());
                for r in 0..rows {
                    for &c in &kept {
                        out.push(data[(r as usize) * (cols as usize) + c].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
            }
        }

        // ── Array higher-order functions (L3 of the LAMBDA arc) ──────
        //
        // All of these take a lambda value as one of their arguments
        // (always the LAST one — Excel's calling convention) and apply
        // it pointwise / by row / by column / accumulator-style to
        // produce a derived array. Lambdas reach them either inline
        // (`=MAP(SEQUENCE(5), LAMBDA(x, x*2))`) or via a LET binding
        // (`=LET(sq, LAMBDA(x, x*x), MAP(A1:A5, sq))`).
        //
        // Common patterns:
        //   - Lambda arg evaluated first; non-lambda → WrongType.
        //   - Arity matched at call time; mismatch → WrongArgCount.
        //   - Per-element scalar errors stay in result arrays; nested array
        //     callback results are rejected as #CALC!.

        // MAP(array1, ..., arrayN, lambda)
        //
        // Lambda must accept exactly N arguments (one per input array).
        // All input arrays must share the same shape — mismatch → WrongType.
        // The result has the same shape as the inputs; each cell is
        // `lambda(array1[i,j], ..., arrayN[i,j])`.
                _ => unreachable!(),
    }
}
