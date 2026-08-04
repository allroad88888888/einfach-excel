use super::*;

pub(super) struct LinRegFit {
    /// Slopes in input order (`m1..mk`). Length = `k`.
    pub(super) slopes: Vec<f64>,
    /// Intercept (`0.0` when `with_intercept = false`).
    pub(super) intercept: f64,
    pub(super) with_intercept: bool,
    pub(super) ss_res: f64,
    pub(super) ss_tot: f64,
    /// Per-slope standard errors, same order as `slopes`.
    pub(super) se: Vec<f64>,
    pub(super) se_intercept: f64,
    pub(super) df: f64,
    pub(super) k_vars: usize,
}

pub(super) fn linreg_core(xs: &[Vec<f64>], ys: &[f64], with_intercept: bool) -> Result<LinRegFit, ValueError> {
    let n = ys.len();
    if n == 0 {
        return Err(ValueError::InvalidValue);
    }
    if !xs.is_empty() && xs.len() != n {
        return Err(ValueError::InvalidValue);
    }
    let k = if xs.is_empty() { 0 } else { xs[0].len() };
    for row in xs {
        if row.len() != k {
            return Err(ValueError::InvalidValue);
        }
    }
    let p_eff = k + if with_intercept { 1 } else { 0 };
    if p_eff == 0 {
        return Err(ValueError::InvalidValue);
    }
    if n < p_eff {
        return Err(ValueError::InvalidValue);
    }
    // Build the design matrix X (n × p_eff). Layout: x columns first,
    // then optional intercept column of 1s.
    let mut x_mat: Vec<Vec<f64>> = (0..n).map(|_| vec![0.0; p_eff]).collect();
    for r in 0..n {
        for c in 0..k {
            x_mat[r][c] = xs[r][c];
        }
        if with_intercept {
            x_mat[r][p_eff - 1] = 1.0;
        }
    }
    // Normal equations: A = X^T X (p×p), bvec = X^T y (p).
    let mut a: Vec<Vec<f64>> = vec![vec![0.0; p_eff]; p_eff];
    let mut bvec: Vec<f64> = vec![0.0; p_eff];
    for i in 0..p_eff {
        for j in 0..p_eff {
            let mut s = 0.0;
            for r in 0..n {
                s += x_mat[r][i] * x_mat[r][j];
            }
            a[i][j] = s;
        }
        let mut s = 0.0;
        for r in 0..n {
            s += x_mat[r][i] * ys[r];
        }
        bvec[i] = s;
    }
    // Keep a copy of A for SE computation (we need (X^T X)^-1).
    let a_copy: Vec<Vec<f64>> = a.iter().cloned().collect();
    // Solve via Gauss-Jordan augmented with bvec.
    let mut piv_a = a;
    {
        let n_local = p_eff;
        for i in 0..n_local {
            let mut piv = i;
            let mut piv_val = piv_a[i][i].abs();
            for r in (i + 1)..n_local {
                let v = piv_a[r][i].abs();
                if v > piv_val {
                    piv_val = v;
                    piv = r;
                }
            }
            if piv_val < 1e-12 {
                return Err(ValueError::Overflow);
            }
            if piv != i {
                piv_a.swap(i, piv);
                bvec.swap(i, piv);
            }
            let div = piv_a[i][i];
            for c in i..n_local {
                piv_a[i][c] /= div;
            }
            bvec[i] /= div;
            for r in 0..n_local {
                if r == i {
                    continue;
                }
                let factor = piv_a[r][i];
                if factor == 0.0 {
                    continue;
                }
                for c in i..n_local {
                    piv_a[r][c] -= factor * piv_a[i][c];
                }
                bvec[r] -= factor * bvec[i];
            }
        }
    }
    let betas = bvec; // length p_eff
    let slopes: Vec<f64> = (0..k).map(|i| betas[i]).collect();
    let intercept = if with_intercept {
        betas[p_eff - 1]
    } else {
        0.0
    };
    // Predicted ŷ.
    let mut predicted = vec![0.0_f64; n];
    for r in 0..n {
        let mut yhat = 0.0;
        for c in 0..k {
            yhat += xs[r][c] * slopes[c];
        }
        if with_intercept {
            yhat += intercept;
        }
        predicted[r] = yhat;
    }
    // SS_res, SS_tot.
    let y_mean: f64 = ys.iter().sum::<f64>() / (n as f64);
    let mut ss_res = 0.0;
    let mut ss_tot = 0.0;
    for r in 0..n {
        let resid = ys[r] - predicted[r];
        ss_res += resid * resid;
        // Excel treats SS_tot as Σ(y - ȳ)² when intercept = TRUE, and
        // as Σy² (uncorrected) when intercept = FALSE.
        if with_intercept {
            let diff = ys[r] - y_mean;
            ss_tot += diff * diff;
        } else {
            ss_tot += ys[r] * ys[r];
        }
    }
    let df = (n as f64) - (p_eff as f64);
    let mse = if df > 0.0 { ss_res / df } else { 0.0 };
    let (se_slopes, se_intercept) = if df > 0.0 {
        match matrix_inverse_inplace(a_copy) {
            Ok(inv) => {
                let mut se_v = vec![0.0_f64; k];
                for j in 0..k {
                    let var_j = inv[j][j] * mse;
                    se_v[j] = if var_j > 0.0 { var_j.sqrt() } else { 0.0 };
                }
                let se_int = if with_intercept {
                    let last = p_eff - 1;
                    let var_int = inv[last][last] * mse;
                    if var_int > 0.0 {
                        var_int.sqrt()
                    } else {
                        0.0
                    }
                } else {
                    0.0
                };
                (se_v, se_int)
            }
            Err(_) => (vec![0.0_f64; k], 0.0),
        }
    } else {
        (vec![0.0_f64; k], 0.0)
    };
    Ok(LinRegFit {
        slopes,
        intercept,
        with_intercept,
        ss_res,
        ss_tot,
        se: se_slopes,
        se_intercept,
        df,
        k_vars: k,
    })
}
