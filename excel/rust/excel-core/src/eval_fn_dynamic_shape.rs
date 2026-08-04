//! Dispatches dynamic shape formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_shape(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"TAKE" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows_arg_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = rows_arg_v {
                return Value::Error(e);
            }
            let rows_arg = match coerce_to_number(&rows_arg_v) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            if rows_arg == 0 {
                return Value::Error(ValueError::Calc);
            }
            let cols_arg = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                if n == 0 {
                    return Value::Error(ValueError::Calc);
                }
                Some(n)
            } else {
                None
            };
            // Compute row slice [r_start, r_end).
            let (r_start, r_end) = if rows_arg > 0 {
                let take = (rows_arg as u32).min(rows);
                (0u32, take)
            } else {
                let want = ((-rows_arg) as u32).min(rows);
                (rows - want, rows)
            };
            // Compute col slice [c_start, c_end).
            let (c_start, c_end) = match cols_arg {
                None => (0u32, cols),
                Some(n) if n > 0 => (0u32, (n as u32).min(cols)),
                Some(n) => {
                    let want = ((-n) as u32).min(cols);
                    (cols - want, cols)
                }
            };
            let out_rows = r_end - r_start;
            let out_cols = c_end - c_start;
            let cap = match checked_array_len(out_rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in r_start..r_end {
                for c in c_start..c_end {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "DROP" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows_arg_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = rows_arg_v {
                return Value::Error(e);
            }
            let rows_arg = match coerce_to_number(&rows_arg_v) {
                Some(n) => n.trunc() as i64,
                None => return Value::Error(ValueError::WrongType),
            };
            let cols_arg = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => Some(n.trunc() as i64),
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                None
            };
            // Row slice [r_start, r_end).
            let (r_start, r_end) = if rows_arg >= 0 {
                let drop = (rows_arg as u32).min(rows);
                (drop, rows)
            } else {
                let drop = ((-rows_arg) as u32).min(rows);
                (0u32, rows - drop)
            };
            // Col slice [c_start, c_end).
            let (c_start, c_end) = match cols_arg {
                None => (0u32, cols),
                Some(n) if n >= 0 => ((n as u32).min(cols), cols),
                Some(n) => {
                    let drop = ((-n) as u32).min(cols);
                    (0u32, cols - drop)
                }
            };
            if r_end <= r_start || c_end <= c_start {
                return Value::Error(ValueError::Calc);
            }
            let out_rows = r_end - r_start;
            let out_cols = c_end - c_start;
            let cap = match checked_array_len(out_rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in r_start..r_end {
                for c in c_start..c_end {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "EXPAND" => fn_expand(args, provider),
                _ => unreachable!(),
    }
}
