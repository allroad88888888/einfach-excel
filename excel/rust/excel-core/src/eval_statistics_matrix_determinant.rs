use super::*;

pub(super) fn fn_mdeterm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let grid = match collect_range_2d_for_arg(&args[0], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let n = grid.len();
    if n == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let cols = grid[0].len();
    if cols != n {
        return Value::Error(ValueError::InvalidValue);
    }
    if n > 100 {
        return Value::Error(ValueError::Overflow);
    }
    // Materialise as f64 matrix; propagate errors and reject non-numeric.
    let mut m: Vec<Vec<f64>> = vec![vec![0.0; n]; n];
    for r in 0..n {
        if grid[r].len() != n {
            return Value::Error(ValueError::InvalidValue);
        }
        for c in 0..n {
            match &grid[r][c] {
                Value::Error(e) => return Value::Error(e.clone()),
                Value::Number(x) => m[r][c] = *x,
                Value::Null => m[r][c] = 0.0,
                Value::Boolean(b) => m[r][c] = if *b { 1.0 } else { 0.0 },
                Value::Text(_) => return Value::Error(ValueError::WrongType),
                // Dynamic-array: collapse to top-left scalar then retry.
                // Phase 1 unreachable — no constructor produces Array yet.
                Value::Array(arr) => match arr.get(0, 0) {
                    Some(Value::Number(x)) => m[r][c] = *x,
                    Some(Value::Null) | None => m[r][c] = 0.0,
                    Some(Value::Boolean(b)) => m[r][c] = if *b { 1.0 } else { 0.0 },
                    Some(Value::Error(e)) => return Value::Error(e.clone()),
                    Some(_) => return Value::Error(ValueError::WrongType),
                },
                // Determinant of a matrix containing a lambda — type error.
                Value::Lambda(_) => return Value::Error(ValueError::WrongType),
            }
        }
    }
    // LU with partial pivoting; det = product(diag(U)) * (-1)^swaps.
    let mut det = 1.0_f64;
    for i in 0..n {
        // Find pivot in column i.
        let mut piv_row = i;
        let mut piv_val = m[i][i].abs();
        for r in (i + 1)..n {
            let v = m[r][i].abs();
            if v > piv_val {
                piv_val = v;
                piv_row = r;
            }
        }
        if piv_val == 0.0 {
            return Value::Number(0.0);
        }
        if piv_row != i {
            m.swap(i, piv_row);
            det = -det;
        }
        det *= m[i][i];
        // Eliminate column i below row i.
        for r in (i + 1)..n {
            let factor = m[r][i] / m[i][i];
            for c in i..n {
                m[r][c] -= factor * m[i][c];
            }
        }
    }
    if det.is_finite() {
        Value::Number(det)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
