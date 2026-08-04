//! Dispatches dynamic sort formula functions.

use super::*;

pub(super) fn eval_fn_dynamic_sort(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {
        "SORT" => {
            if args.is_empty() || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            // 三个可选参数写成空占位 ⇒ 取默认值，而不是强转 0：
            // `=SORT(区域,,-1)` 是 Excel 里最常见的降序写法，强转 0 会撞上
            // 下面 sort_index ≥ 1 的校验判成 `#VALUE!`。
            let sort_index = match args.get(1).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    match coerce_to_number(&v) {
                        Some(n) if n >= 1.0 => n.trunc() as u32,
                        _ => return Value::Error(ValueError::InvalidValue),
                    }
                }
                None => 1u32,
            };
            let sort_order = match args.get(2).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    match coerce_to_number(&v) {
                        Some(n) if n == 1.0 => 1i32,
                        Some(n) if n == -1.0 => -1i32,
                        _ => return Value::Error(ValueError::InvalidValue),
                    }
                }
                None => 1i32,
            };
            let by_col = match args.get(3).filter(|a| !arg_is_omitted(a)) {
                Some(a) => {
                    let v = eval_expr_with_provider(a, provider);
                    if let Value::Error(e) = v {
                        return Value::Error(e);
                    }
                    coerce_to_bool(&v).unwrap_or(false)
                }
                None => false,
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Range check on sort_index.
            if by_col {
                if sort_index > rows {
                    return Value::Error(ValueError::InvalidValue);
                }
            } else if sort_index > cols {
                return Value::Error(ValueError::InvalidValue);
            }
            // Build indices and sort by the key. Stable sort via Vec::sort_by.
            if by_col {
                // Sort columns by row (sort_index - 1).
                let key_row = (sort_index - 1) as usize;
                let mut order: Vec<u32> = (0..cols).collect();
                // Propagate any errors found in the key row.
                for &c in order.iter() {
                    let v = &data[key_row * (cols as usize) + (c as usize)];
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                order.sort_by(|&a, &b| {
                    let va = &data[key_row * (cols as usize) + (a as usize)];
                    let vb = &data[key_row * (cols as usize) + (b as usize)];
                    let c = compare_lookup(va, vb);
                    if sort_order == -1 {
                        c.reverse()
                    } else {
                        c
                    }
                });
                let mut out: Vec<Value> = Vec::with_capacity(data.len());
                for r in 0..rows {
                    for &c in &order {
                        out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
            } else {
                // Sort rows by column (sort_index - 1).
                let key_col = (sort_index - 1) as usize;
                let mut order: Vec<u32> = (0..rows).collect();
                for &r in order.iter() {
                    let v = &data[(r as usize) * (cols as usize) + key_col];
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                order.sort_by(|&a, &b| {
                    let va = &data[(a as usize) * (cols as usize) + key_col];
                    let vb = &data[(b as usize) * (cols as usize) + key_col];
                    let c = compare_lookup(va, vb);
                    if sort_order == -1 {
                        c.reverse()
                    } else {
                        c
                    }
                });
                let mut out: Vec<Value> = Vec::with_capacity(data.len());
                for &r in &order {
                    for c in 0..cols {
                        out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                    }
                }
                Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
            }
        }

        // FILTER(array, include[, if_empty]) — Keep rows where include's
        // matching element is truthy (column-vector include with rows ==
        // array.rows) OR keep columns (row-vector include with cols ==
        // array.cols). Empty result → if_empty (1x1 array) or #VALUE!.
        "SORTBY" => {
            if args.len() < 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Validate the trailing arg pattern. After `array`, args come in
            // (by_array, [sort_order]) pairs; the order arg is optional, so we
            // accept any number of trailing args as long as they parse cleanly.
            // We walk the args list and pull (by_array, order) groups.
            let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if rows == 0 || cols == 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            // Each key: (Vec<Value> with `rows` entries, order: i32)
            let mut keys: Vec<(Vec<Value>, i32)> = Vec::new();
            let mut idx = 1;
            while idx < args.len() {
                let (krows, kcols, kdata) = match arg_to_2d(&args[idx], provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                // by_array must have rows == array.rows. Accept either a column
                // vector (kcols == 1) or take the first column otherwise — but
                // strict Excel parity requires a single column shape, so reject
                // anything else.
                if krows != rows || kcols != 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                // Propagate any errors found in this key array.
                for v in &kdata {
                    if let Value::Error(e) = v {
                        return Value::Error(e.clone());
                    }
                }
                // Optional sort_order following the by_array.
                let order = if idx + 1 < args.len() {
                    if arg_is_omitted(&args[idx + 1]) {
                        // `sort_order` is optional. A trailing empty slot is
                        // syntactically omitted, so it keeps the documented
                        // ascending default instead of coercing to zero.
                        idx += 1;
                        1i32
                    } else {
                        // Peek the next arg. If it evaluates to a number 1 or -1,
                        // treat it as the order. We cannot disambiguate "by_array
                        // shaped like a 1-element array passed as a key" from
                        // "scalar 1 used as sort_order"; Excel resolves this by
                        // strictly requiring a scalar where a sort_order is
                        // expected. We follow the SORT precedent: any arg that
                        // coerces to a scalar 1 / -1 is taken as the order.
                        // Evaluate without consuming: if it's a range/array, treat
                        // as the next key.
                        let is_range =
                            matches!(&args[idx + 1], Expr::Range { .. } | Expr::SheetRange { .. });
                        if is_range {
                            // Definitely another key; no explicit order.
                            1i32
                        } else {
                            let v = eval_expr_with_provider(&args[idx + 1], provider);
                            if let Value::Error(e) = v {
                                return Value::Error(e);
                            }
                            match coerce_to_number(&v) {
                                Some(n) if n == 1.0 => {
                                    idx += 1;
                                    1i32
                                }
                                Some(n) if n == -1.0 => {
                                    idx += 1;
                                    -1i32
                                }
                                _ => return Value::Error(ValueError::InvalidValue),
                            }
                        }
                    }
                } else {
                    1i32
                };
                keys.push((kdata, order));
                idx += 1;
            }
            if keys.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            // Build the permutation. Stable sort_by lets us cleanly express
            // multi-key precedence: compare key[0]; if equal, compare key[1];
            // etc. Stability covers any final ties.
            let mut order: Vec<u32> = (0..rows).collect();
            order.sort_by(|&a, &b| {
                for (kdata, sort_order) in &keys {
                    let va = &kdata[a as usize];
                    let vb = &kdata[b as usize];
                    let mut c = compare_lookup(va, vb);
                    if *sort_order == -1 {
                        c = c.reverse();
                    }
                    if c != std::cmp::Ordering::Equal {
                        return c;
                    }
                }
                std::cmp::Ordering::Equal
            });
            // Re-assemble `data` in the new row order.
            let mut out: Vec<Value> = Vec::with_capacity(data.len());
            for &r in &order {
                for c in 0..cols {
                    out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
                }
            }
            Value::Array(Arc::new(ArrayData::new(rows, cols, out)))
        }
        _ => unreachable!(),
    }
}
