use super::*;

pub(super) fn fn_mmult(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let a = match arg_to_f64_matrix(&args[0], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let b = match arg_to_f64_matrix(&args[1], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    if a.is_empty() || b.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let ra = a.len();
    let ca = a[0].len();
    let rb = b.len();
    let cb = b[0].len();
    if ca != rb {
        return Value::Error(ValueError::InvalidValue);
    }
    let total = (ra as u64).checked_mul(cb as u64).unwrap_or(u64::MAX);
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut data: Vec<Value> = Vec::with_capacity(ra * cb);
    for r in 0..ra {
        for c in 0..cb {
            let mut s = 0.0;
            for k in 0..ca {
                s += a[r][k] * b[k][c];
            }
            if !s.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            data.push(Value::Number(s));
        }
    }
    Value::Array(Arc::new(ArrayData::new(ra as u32, cb as u32, data)))
}

/// MINVERSE(square_array). Inverse via Gauss-Jordan with partial pivoting.
pub(super) fn fn_minverse(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let m = match arg_to_f64_matrix(&args[0], provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let n = m.len();
    if n == 0 || m.iter().any(|r| r.len() != n) {
        return Value::Error(ValueError::InvalidValue);
    }
    if n > 100 {
        return Value::Error(ValueError::Overflow);
    }
    let inv = match matrix_inverse_inplace(m) {
        Ok(i) => i,
        Err(e) => return Value::Error(e),
    };
    let mut data: Vec<Value> = Vec::with_capacity(n * n);
    for r in 0..n {
        for c in 0..n {
            data.push(Value::Number(inv[r][c]));
        }
    }
    Value::Array(Arc::new(ArrayData::new(n as u32, n as u32, data)))
}

/// MUNIT(n). Identity matrix of size n×n.
pub(super) fn fn_munit(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n >= 1.0 => n.trunc() as u32,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    if checked_array_len(n as u64, n as u64).is_err() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut data: Vec<Value> = Vec::with_capacity((n as usize) * (n as usize));
    for r in 0..n {
        for c in 0..n {
            data.push(Value::Number(if r == c { 1.0 } else { 0.0 }));
        }
    }
    Value::Array(Arc::new(ArrayData::new(n, n, data)))
}

/// TRANSPOSE(array). Swap rows and columns. Preserves cell-error /
/// type cells verbatim (no numeric coercion required).
pub(super) fn fn_transpose(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if rows == 0 || cols == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let total = (rows as u64) * (cols as u64);
    if total > DYNAMIC_ARRAY_CELL_CAP {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut out: Vec<Value> = vec![Value::Null; (rows as usize) * (cols as usize)];
    // Source idx = r * cols + c; dest idx (in cols × rows) = c * rows + r.
    for r in 0..rows as usize {
        for c in 0..cols as usize {
            let src = r * (cols as usize) + c;
            let dst = c * (rows as usize) + r;
            out[dst] = data[src].clone();
        }
    }
    Value::Array(Arc::new(ArrayData::new(cols, rows, out)))
}
