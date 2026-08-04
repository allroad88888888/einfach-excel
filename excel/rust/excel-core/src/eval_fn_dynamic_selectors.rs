//! Dispatches dynamic selectors formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_selectors(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"CHOOSEROWS" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut picks: Vec<u32> = Vec::with_capacity(args.len() - 1);
            for a in &args[1..] {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                let resolved: i64 = if n > 0 {
                    n - 1
                } else if n < 0 {
                    (rows as i64) + n
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                if resolved < 0 || resolved >= rows as i64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                picks.push(resolved as u32);
            }
            let out_rows = picks.len() as u32;
            // 格数闸门：pick 可以重复，输出行数不受输入行数约束
            // （`=CHOOSEROWS(A1:XFD1,1,1,…)` 每多一个实参就多复制一整行）。
            let cap = match checked_array_len(out_rows as u64, cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for &r in &picks {
                for c in 0..cols {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, cols, out)))
        }
        "CHOOSECOLS" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut picks: Vec<u32> = Vec::with_capacity(args.len() - 1);
            for a in &args[1..] {
                let v = eval_expr_with_provider(a, provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                let n = match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                };
                let resolved: i64 = if n > 0 {
                    n - 1
                } else if n < 0 {
                    (cols as i64) + n
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                if resolved < 0 || resolved >= cols as i64 {
                    return Value::Error(ValueError::InvalidValue);
                }
                picks.push(resolved as u32);
            }
            let out_cols = picks.len() as u32;
            // 同 CHOOSEROWS：输出列数由实参个数决定，不受输入列数约束。
            let cap = match checked_array_len(rows as u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in 0..rows {
                for &c in &picks {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, out_cols, out)))
        }
                _ => unreachable!(),
    }
}
