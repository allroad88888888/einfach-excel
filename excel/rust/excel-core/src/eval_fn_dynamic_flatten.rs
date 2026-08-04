//! Dispatches dynamic flatten formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_flatten(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"TOROW" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let ignore = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0i64
            };
            if !(0..=3).contains(&ignore) {
                return Value::Error(ValueError::InvalidValue);
            }
            let by_col = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let skip_blanks = ignore == 1 || ignore == 3;
            let skip_errors = ignore == 2 || ignore == 3;
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            let push = |v: &Value, out: &mut Vec<Value>| {
                let drop = (skip_blanks && matches!(v, Value::Null))
                    || (skip_errors && matches!(v, Value::Error(_)));
                if !drop {
                    out.push(v.clone());
                }
            };
            if by_col {
                for c in 0..cols {
                    for r in 0..rows {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            } else {
                for r in 0..rows {
                    for c in 0..cols {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            }
            if out.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            let out_cols = match u32::try_from(out.len()) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            Value::Array(Arc::new(ArrayData::new(1, out_cols, out)))
        }
        "TOCOL" => {
            if args.is_empty() || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let ignore = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n.trunc() as i64,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0i64
            };
            if !(0..=3).contains(&ignore) {
                return Value::Error(ValueError::InvalidValue);
            }
            let by_col = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            let skip_blanks = ignore == 1 || ignore == 3;
            let skip_errors = ignore == 2 || ignore == 3;
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            let push = |v: &Value, out: &mut Vec<Value>| {
                let drop = (skip_blanks && matches!(v, Value::Null))
                    || (skip_errors && matches!(v, Value::Error(_)));
                if !drop {
                    out.push(v.clone());
                }
            };
            if by_col {
                for c in 0..cols {
                    for r in 0..rows {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            } else {
                for r in 0..rows {
                    for c in 0..cols {
                        push(
                            &data[(r as usize) * (cols as usize) + (c as usize)],
                            &mut out,
                        );
                    }
                }
            }
            if out.is_empty() {
                return Value::Error(ValueError::Calc);
            }
            let out_rows = match u32::try_from(out.len()) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            Value::Array(Arc::new(ArrayData::new(out_rows, 1, out)))
        }
        // TOROW / TOCOL 的反方向：把一维向量折回二维。方向依据与全部错误
        // 口径写在 `eval_wrap.rs` 的模块注释里（这一对极容易搞反）。
        "WRAPROWS" => eval_wrap::fn_wraprows(args, provider),
        "WRAPCOLS" => eval_wrap::fn_wrapcols(args, provider),
                _ => unreachable!(),
    }
}
