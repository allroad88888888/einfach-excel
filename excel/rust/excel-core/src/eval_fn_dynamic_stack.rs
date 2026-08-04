//! Dispatches dynamic stack formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_stack(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"VSTACK" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut blocks: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(args.len());
            for a in args {
                let (r, c, d) = match arg_to_2d(a, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                if r == 0 || c == 0 {
                    return Value::Error(ValueError::InvalidValue);
                }
                blocks.push((r, c, d));
            }
            let out_cols = blocks.iter().map(|(_, c, _)| *c).max().unwrap_or(0);
            let out_rows_u64 = blocks
                .iter()
                .try_fold(0u64, |acc, (r, _, _)| acc.checked_add(*r as u64))
                .unwrap_or(u64::MAX);
            let cap = match checked_array_len(out_rows_u64, out_cols as u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let out_rows = match u32::try_from(out_rows_u64) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for (br, bc, bd) in &blocks {
                for r in 0..*br {
                    for c in 0..out_cols {
                        if c < *bc {
                            out.push(bd[(r as usize) * (*bc as usize) + (c as usize)].clone());
                        } else {
                            out.push(Value::Error(ValueError::NotAvailable));
                        }
                    }
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
        "HSTACK" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut blocks: Vec<(u32, u32, Vec<Value>)> = Vec::with_capacity(args.len());
            for a in args {
                let (r, c, d) = match arg_to_2d(a, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                if r == 0 || c == 0 {
                    return Value::Error(ValueError::InvalidValue);
                }
                blocks.push((r, c, d));
            }
            let out_rows = blocks.iter().map(|(r, _, _)| *r).max().unwrap_or(0);
            let out_cols_u64 = blocks
                .iter()
                .try_fold(0u64, |acc, (_, c, _)| acc.checked_add(*c as u64))
                .unwrap_or(u64::MAX);
            let cap = match checked_array_len(out_rows as u64, out_cols_u64) {
                Ok(cap) => cap,
                Err(e) => return Value::Error(e),
            };
            let out_cols = match u32::try_from(out_cols_u64) {
                Ok(v) => v,
                Err(_) => return Value::Error(ValueError::InvalidValue),
            };
            let mut out: Vec<Value> = Vec::with_capacity(cap);
            for r in 0..out_rows {
                for (br, bc, bd) in &blocks {
                    for c in 0..*bc {
                        if r < *br {
                            out.push(bd[(r as usize) * (*bc as usize) + (c as usize)].clone());
                        } else {
                            out.push(Value::Error(ValueError::NotAvailable));
                        }
                    }
                }
            }
            Value::Array(Arc::new(ArrayData::new(out_rows, out_cols, out)))
        }
                _ => unreachable!(),
    }
}
