use super::*;

pub(super) fn fn_lookup(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let needle = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &needle {
        return Value::Error(e.clone());
    }
    let lookup_grid = match collect_range_2d_for_arg(&args[1], provider) {
        Some(g) => g,
        None => {
            // Non-range — accept a scalar / array value as a 1×1 grid.
            let v = eval_expr_with_provider(&args[1], provider);
            match v {
                Value::Error(e) => return Value::Error(e),
                Value::Array(arr) => {
                    let (rows, cols) = arr.shape();
                    let data = arr.data.clone();
                    let mut g = Vec::with_capacity(rows as usize);
                    for r in 0..rows as usize {
                        let mut row = Vec::with_capacity(cols as usize);
                        for c in 0..cols as usize {
                            row.push(data[r * (cols as usize) + c].clone());
                        }
                        g.push(row);
                    }
                    g
                }
                other => vec![vec![other]],
            }
        }
    };

    if lookup_grid.is_empty() || lookup_grid[0].is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }

    // Decide vector vs array form.
    let lookup_rows = lookup_grid.len();
    let lookup_cols = lookup_grid[0].len();

    if args.len() == 2 {
        // Either a 1D vector (treat as vector form, result = lookup) or
        // 2D (array form).
        if lookup_rows == 1 || lookup_cols == 1 {
            // Vector form, result_vector = lookup_vector.
            let keys: Vec<Value> = if lookup_rows == 1 {
                lookup_grid[0].clone()
            } else {
                lookup_grid.iter().map(|r| r[0].clone()).collect()
            };
            return lookup_vector_walk(&keys, &keys, &needle);
        }
        // Array form: pick the longer dimension for lookup, the OPPOSITE
        // end of the other dimension for the result.
        if lookup_cols >= lookup_rows {
            // Horizontal: first row = keys, last row = result.
            let keys: Vec<Value> = lookup_grid[0].clone();
            let result: Vec<Value> = lookup_grid[lookup_rows - 1].clone();
            return lookup_vector_walk(&keys, &result, &needle);
        } else {
            // Vertical: first col = keys, last col = result.
            let keys: Vec<Value> = lookup_grid.iter().map(|r| r[0].clone()).collect();
            let result: Vec<Value> = lookup_grid
                .iter()
                .map(|r| r[lookup_cols - 1].clone())
                .collect();
            return lookup_vector_walk(&keys, &result, &needle);
        }
    }

    // 3-arg vector form. Both must be 1D; lengths must agree.
    let lookup_vec: Vec<Value> = if lookup_rows == 1 {
        lookup_grid[0].clone()
    } else if lookup_cols == 1 {
        lookup_grid.iter().map(|r| r[0].clone()).collect()
    } else {
        // Not a vector — Excel still searches the first column/row but
        // we surface #VALUE! to match the spec we documented for this
        // commit (shape mismatch).
        return Value::Error(ValueError::WrongType);
    };
    let result_grid = match collect_range_2d_for_arg(&args[2], provider) {
        Some(g) => g,
        None => {
            let v = eval_expr_with_provider(&args[2], provider);
            match v {
                Value::Error(e) => return Value::Error(e),
                Value::Array(arr) => {
                    let (rows, cols) = arr.shape();
                    let data = arr.data.clone();
                    let mut g = Vec::with_capacity(rows as usize);
                    for r in 0..rows as usize {
                        let mut row = Vec::with_capacity(cols as usize);
                        for c in 0..cols as usize {
                            row.push(data[r * (cols as usize) + c].clone());
                        }
                        g.push(row);
                    }
                    g
                }
                other => vec![vec![other]],
            }
        }
    };
    if result_grid.is_empty() || result_grid[0].is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let r_rows = result_grid.len();
    let r_cols = result_grid[0].len();
    let result_vec: Vec<Value> = if r_rows == 1 {
        result_grid[0].clone()
    } else if r_cols == 1 {
        result_grid.iter().map(|r| r[0].clone()).collect()
    } else {
        return Value::Error(ValueError::WrongType);
    };
    if lookup_vec.len() != result_vec.len() {
        return Value::Error(ValueError::WrongType);
    }
    lookup_vector_walk(&lookup_vec, &result_vec, &needle)
}

/// Linear "exact-or-next-smaller" walk shared by LOOKUP's vector and
/// array forms. We pick the index of the largest key still ≤ needle.
/// If no key is ≤ needle, surface #N/A.
pub(super) fn lookup_vector_walk(keys: &[Value], result: &[Value], needle: &Value) -> Value {
    if keys.is_empty() || keys.len() != result.len() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut best: Option<usize> = None;
    for (i, k) in keys.iter().enumerate() {
        if let Value::Error(e) = k {
            return Value::Error(e.clone());
        }
        if compare_lookup(k, needle).is_le() {
            best = Some(i);
        }
        // Note: we do NOT break when overshoot, because the spec says
        // we should treat the input as ascending but a relaxed walk
        // tolerates non-sorted vectors. Last qualifying key wins —
        // matches Excel's behavior on sorted input.
    }
    match best {
        Some(i) => result[i].clone(),
        None => Value::Error(ValueError::NotAvailable),
    }
}
