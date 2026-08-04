//! Dispatches dynamic by axis formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_by_axis(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"BYROW" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 1 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(rows as usize);
            for i in 0..rows {
                let base = (i as usize) * (cols as usize);
                let row_data: Vec<Value> =
                    data[base..base + (cols as usize)].iter().cloned().collect();
                let row_arr = Value::Array(Arc::new(ArrayData::new(1, cols, row_data)));
                let v = match apply_lambda_for_array_cell(&lambda_v, vec![row_arr], provider) {
                    Ok(v) => v,
                    Err(e) => return Value::Error(e),
                };
                out.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(rows, 1, out)))
        }

        "BYCOL" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let lambda_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = lambda_v {
                return Value::Error(e);
            }
            if !matches!(lambda_v, Value::Lambda(_)) {
                return Value::Error(ValueError::WrongType);
            }
            if let Value::Lambda(lam) = &lambda_v {
                if lam.arity() != 1 {
                    return Value::Error(ValueError::WrongArgCount);
                }
            }
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut out: Vec<Value> = Vec::with_capacity(cols as usize);
            for j in 0..cols {
                let mut col_data: Vec<Value> = Vec::with_capacity(rows as usize);
                for i in 0..rows {
                    let idx = (i as usize) * (cols as usize) + (j as usize);
                    col_data.push(data[idx].clone());
                }
                let col_arr = Value::Array(Arc::new(ArrayData::new(rows, 1, col_data)));
                let v = match apply_lambda_for_array_cell(&lambda_v, vec![col_arr], provider) {
                    Ok(v) => v,
                    Err(e) => return Value::Error(e),
                };
                out.push(v);
            }
            Value::Array(Arc::new(ArrayData::new(1, cols, out)))
        }

        // MAKEARRAY(rows, cols, lambda)
        //
        // Lambda takes 2 args: (row_index, col_index), both 1-based
        // (Excel parity). Returns a rows×cols Array where each cell is
        // `lambda(i, j)`. Same 1M-element cap as SEQUENCE — keeps
        // allocations bounded.
        "MAKEARRAY" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let rows_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = rows_v {
                return Value::Error(e);
            }
            let cols_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = cols_v {
                return Value::Error(e);
            }
            let rows = match coerce_to_number(&rows_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let cols = match coerce_to_number(&cols_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
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
            let rows_u = rows as u32;
            let cols_u = cols as u32;
            let mut out: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 1..=rows_u {
                for j in 1..=cols_u {
                    let v = match apply_lambda_for_array_cell(
                        &lambda_v,
                        vec![Value::Number(i as f64), Value::Number(j as f64)],
                        provider,
                    ) {
                        Ok(v) => v,
                        Err(e) => return Value::Error(e),
                    };
                    out.push(v);
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows_u, cols_u, out)))
        }

                _ => unreachable!(),
    }
}
