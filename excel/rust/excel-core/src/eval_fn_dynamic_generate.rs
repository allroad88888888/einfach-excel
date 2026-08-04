//! Dispatches dynamic generate formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_generate(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SEQUENCE" => {
            if args.is_empty() || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // rows
            let rows_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = rows_v {
                return Value::Error(e);
            }
            let rows = match coerce_to_number(&rows_v) {
                Some(n) if n >= 1.0 => n.trunc() as u64,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            // cols / start / step 写成空占位 ⇒ 取默认值 1，而不是强转 0
            // —— `=SEQUENCE(2,,)` 强转 0 会撞上 cols ≥ 1 的校验判成
            // `#VALUE!`。与 SORT 同一条口径。
            let cols = match args.get(1).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    match coerce_to_number(&v) {
                        Some(n) if n >= 1.0 => n.trunc() as u64,
                        _ => return Value::Error(ValueError::InvalidValue),
                    }
                }
                None => 1u64,
            };
            // start
            let start = match args.get(2).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    match coerce_to_number(&v) {
                        Some(n) => n,
                        None => return Value::Error(ValueError::WrongType),
                    }
                }
                None => 1.0,
            };
            // step
            let step = match args.get(3).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    match coerce_to_number(&v) {
                        Some(n) => n,
                        None => return Value::Error(ValueError::WrongType),
                    }
                }
                None => 1.0,
            };
            // Cap total elements to keep allocations bounded.
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            let rows = rows as u32;
            let cols = cols as u32;
            let mut data: Vec<Value> = Vec::with_capacity(total as usize);
            for i in 0..rows {
                for j in 0..cols {
                    let idx = (i as u64) * (cols as u64) + (j as u64);
                    data.push(Value::Number(start + (idx as f64) * step));
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, data)))
        }

        // UNIQUE(array[, by_col[, exactly_once]]) — Deduplicate rows (or
        // columns, when `by_col`). When `exactly_once`, drop anything that
        // appears more than once. Empty result (all dropped) → #VALUE!.
        "RANDARRAY" => {
            if args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let rows = if !args.is_empty() {
                let v = eval_expr_with_provider(&args[0], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u64,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u64
            };
            let cols = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) if n >= 1.0 => n.trunc() as u64,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1u64
            };
            let min_v = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                0.0
            };
            let max_v = if args.len() >= 4 {
                let v = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match coerce_to_number(&v) {
                    Some(n) => n,
                    None => return Value::Error(ValueError::WrongType),
                }
            } else {
                1.0
            };
            let whole = if args.len() == 5 {
                let v = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                coerce_to_bool(&v).unwrap_or(false)
            } else {
                false
            };
            if min_v > max_v {
                return Value::Error(ValueError::InvalidValue);
            }
            if whole && (min_v.fract() != 0.0 || max_v.fract() != 0.0) {
                return Value::Error(ValueError::InvalidValue);
            }
            let total = rows.checked_mul(cols).unwrap_or(u64::MAX);
            if total > DYNAMIC_ARRAY_CELL_CAP {
                return Value::Error(ValueError::InvalidValue);
            }
            // Seed from system clock + a tiny mix so two rapid calls don't
            // collide. We don't have access to a `rand` crate; xorshift64
            // is plenty for spreadsheet RNG.
            let seed = {
                use std::time::{SystemTime, UNIX_EPOCH};
                let nanos = SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .map(|d| d.as_nanos() as u64)
                    .unwrap_or(0x9E37_79B9_7F4A_7C15);
                // XOR in the requested shape so back-to-back calls of the
                // same shape still vary.
                nanos ^ ((rows as u64) << 32) ^ (cols as u64)
            };
            let mut state: u64 = if seed == 0 {
                0x9E37_79B9_7F4A_7C15
            } else {
                seed
            };
            let next_u64 = |s: &mut u64| -> u64 {
                // xorshift64
                let mut x = *s;
                x ^= x << 13;
                x ^= x >> 7;
                x ^= x << 17;
                *s = x;
                x
            };
            let rows_u = rows as u32;
            let cols_u = cols as u32;
            let mut data: Vec<Value> = Vec::with_capacity(total as usize);
            if whole {
                let min_i = min_v as i64;
                let max_i = max_v as i64;
                // Inclusive range size.
                let span = (max_i - min_i) as u64 + 1;
                for _ in 0..total {
                    let r = next_u64(&mut state) % span;
                    data.push(Value::Number((min_i as f64) + (r as f64)));
                }
            } else {
                let span = max_v - min_v;
                for _ in 0..total {
                    // Mantissa-style uniform [0,1).
                    let r = (next_u64(&mut state) >> 11) as f64 * (1.0f64 / ((1u64 << 53) as f64));
                    data.push(Value::Number(min_v + r * span));
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows_u, cols_u, data)))
        }
                _ => unreachable!(),
    }
}
