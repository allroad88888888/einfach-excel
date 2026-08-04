use super::*;

pub(super) fn arg_to_f64_matrix(arg: &Expr, provider: &dyn EvalProvider) -> Result<Vec<Vec<f64>>, ValueError> {
    let (rows, cols, data) = arg_to_2d(arg, provider)?;
    if rows == 0 || cols == 0 {
        return Ok(Vec::new());
    }
    let mut out: Vec<Vec<f64>> = vec![vec![0.0; cols as usize]; rows as usize];
    for r in 0..rows as usize {
        for c in 0..cols as usize {
            let idx = r * cols as usize + c;
            let v = &data[idx];
            match v {
                Value::Error(e) => return Err(e.clone()),
                Value::Number(n) => out[r][c] = *n,
                Value::Null => out[r][c] = 0.0,
                Value::Boolean(b) => out[r][c] = if *b { 1.0 } else { 0.0 },
                Value::Text(_) | Value::Lambda(_) => return Err(ValueError::WrongType),
                Value::Array(arr) => match arr.get(0, 0) {
                    Some(Value::Number(n)) => out[r][c] = *n,
                    Some(Value::Null) | None => out[r][c] = 0.0,
                    Some(Value::Boolean(b)) => out[r][c] = if *b { 1.0 } else { 0.0 },
                    Some(Value::Error(e)) => return Err(e.clone()),
                    Some(_) => return Err(ValueError::WrongType),
                },
            }
        }
    }
    Ok(out)
}

/// Flatten a 1-D-ish matrix (either 1×n, n×1, or already a flat list)
/// into a `Vec<f64>`. Errors on rank-2 inputs.
pub(super) fn matrix_to_vector_strict(m: &[Vec<f64>]) -> Result<Vec<f64>, ValueError> {
    if m.is_empty() {
        return Ok(Vec::new());
    }
    let rows = m.len();
    let cols = m[0].len();
    if rows == 1 {
        return Ok(m[0].clone());
    }
    if cols == 1 {
        return Ok(m.iter().map(|r| r[0]).collect());
    }
    Err(ValueError::InvalidValue)
}
