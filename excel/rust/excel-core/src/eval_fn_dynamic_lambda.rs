//! Dispatches dynamic lambda formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_lambda(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"MAP" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Last arg is the lambda. Evaluate it first so a non-lambda
            // surfaces a clean error before doing any array work.
            let lambda_v = eval_expr_with_provider(&args[args.len() - 1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            let n_arrays = args.len() - 1;
            // Gather every input array as a 2D buffer + shape.
            let mut grids: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(n_arrays);
            for arg in &args[..n_arrays] {
                let (r, c, d) = match arg_to_2d(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                grids.push((r, c, d));
            }
            // All inputs must share the same shape.
            let (rows, cols, _) = grids[0];
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            for (r, c, _) in &grids[1..] {
                if *r != rows || *c != cols {
                    return Value::Error(ValueError::WrongType);
                }
            }
            // Arity check on the lambda. apply_lambda would catch this
            // per-cell, but we'd waste work — fail eagerly with a clear
            // signal that the lambda doesn't fit the call shape.
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != n_arrays {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            // Cap matches SEQUENCE — keep allocations bounded.
            let total = (rows as u64) * (cols as u64);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let cell_args: Vec<Value> =
                        grids.iter().map(|(_, _, d)| d[idx].clone()).collect();
                    let v = match apply_lambda_for_array_cell(&lambda_v, cell_args, provider) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(v);
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }

        // REDUCE(initial, array, lambda)
        //
        // Lambda takes 2 args: (accumulator, value). Walks the array in
        // row-major order, accumulator = lambda(accumulator, value).
        // Returns the final accumulator — SCALAR result (NOT an Array).
        // The L3 spec is explicit: REDUCE returns a scalar; use SCAN if
        // you want the trail of intermediate accumulators.
        "REDUCE" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let initial = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = initial {
                return Value::Error(e);
            }
            let (rows, cols, data) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 2 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            let mut acc = initial;
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let v = data[idx].clone();
                    acc = apply_lambda(&lambda_v, vec![acc, v], provider);
                    if let Value::Error(e) = &acc {
                        return Value::Error(e.clone());
                    }
                }
            }
            acc
        }

        // SCAN(initial, array, lambda)
        //
        // Same accumulator pattern as REDUCE, but emits an Array of the
        // INTERMEDIATE accumulator values (same shape as the input
        // array). `out[i,j] = lambda(acc, array[i,j])` where `acc` is
        // updated in place row-major. SCAN is the spillable counterpart
        // of REDUCE.
        "SCAN" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let initial = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = initial {
                return Value::Error(e);
            }
            let (rows, cols, data) = match arg_to_2d(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 2 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let total = (rows as u64) * (cols as u64);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            let mut acc = initial;
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    let v = data[idx].clone();
                    acc = match apply_lambda_for_array_cell(&lambda_v, vec![acc, v], provider) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(acc.clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }

        // BYROW(array, lambda) and BYCOL(array, lambda)
        //
        // Lambda takes a SINGLE argument — a row (1×cols Array) for
        // BYROW or a column (rows×1 Array) for BYCOL. Result shape is
        // N×1 (BYROW: one accumulator per row) or 1×N (BYCOL: one per
        // column). The "row" / "column" passed to the lambda is itself
        // a `Value::Array`, NOT a flat list — this is what lets
        // `BYROW(input, LAMBDA(r, SUM(r)))` work (SUM unwraps the Array
        // through `for_each_arg_value`).
                _ => unreachable!(),
    }
}
