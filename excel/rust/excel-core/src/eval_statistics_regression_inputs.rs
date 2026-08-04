use super::*;

pub(super) fn extract_known_y(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(Vec<f64>, bool), ValueError> {
    let m = arg_to_f64_matrix(arg, provider)?;
    if m.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    let rows = m.len();
    let cols = m[0].len();
    if rows == 1 {
        Ok((m[0].clone(), false))
    } else if cols == 1 {
        Ok((m.iter().map(|r| r[0]).collect(), true))
    } else {
        Err(ValueError::InvalidValue)
    }
}

/// Extract `known_x` as an n×k regressor matrix. Each row is an
/// observation, each column is a variable. Auto-transposes when the
/// orientation doesn't match `y`.
pub(super) fn extract_known_x(
    arg: Option<&Expr>,
    n_required: usize,
    y_vertical: bool,
    provider: &dyn EvalProvider,
) -> Result<Vec<Vec<f64>>, ValueError> {
    let Some(a) = arg else {
        // Default x = 1..n, single column.
        return Ok((0..n_required).map(|i| vec![(i + 1) as f64]).collect());
    };
    let m = arg_to_f64_matrix(a, provider)?;
    if m.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    let rows = m.len();
    let cols = m[0].len();
    let (n_obs, k_vars, transpose) = if y_vertical {
        if rows == n_required {
            (rows, cols, false)
        } else if cols == n_required {
            (cols, rows, true)
        } else {
            return Err(ValueError::InvalidValue);
        }
    } else if cols == n_required {
        (cols, rows, true)
    } else if rows == n_required {
        (rows, cols, false)
    } else {
        return Err(ValueError::InvalidValue);
    };
    let mut out: Vec<Vec<f64>> = vec![vec![0.0; k_vars]; n_obs];
    for r in 0..n_obs {
        for c in 0..k_vars {
            out[r][c] = if transpose { m[c][r] } else { m[r][c] };
        }
    }
    Ok(out)
}
