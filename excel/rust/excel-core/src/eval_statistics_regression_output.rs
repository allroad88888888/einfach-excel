use super::*;

pub(super) fn linest_flags(
    args: &[Expr],
    flag_offset: usize,
    provider: &dyn EvalProvider,
) -> Result<(bool, bool), ValueError> {
    let with_intercept = if args.len() > flag_offset {
        let v = eval_expr_with_provider(&args[flag_offset], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).unwrap_or(true)
    } else {
        true
    };
    let stats = if args.len() > flag_offset + 1 {
        let v = eval_expr_with_provider(&args[flag_offset + 1], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).unwrap_or(false)
    } else {
        false
    };
    Ok((with_intercept, stats))
}

/// Build the LINEST/LOGEST diagnostic output array.
///
/// Excel surfaces slopes **right-to-left**: the last regressor's slope
/// is in column 0, the first regressor's slope sits just left of the
/// intercept (column k-1), and the intercept lands in column k. When
/// `stats = FALSE`, this is a single 1×(k+1) row. When `stats = TRUE`,
/// the shape is `5 × (k+1)`:
///
///   row 0: [mk, ..., m1, b]              ← slopes (reversed) + intercept
///   row 1: [se(mk), ..., se(m1), se(b)]
///   row 2: [r², SE_y, #N/A, ..., #N/A]
///   row 3: [F, df, #N/A, ..., #N/A]
///   row 4: [SS_reg, SS_resid, #N/A, ..., #N/A]
pub(super) fn linest_array(fit: &LinRegFit, stats: bool, exp_coefs: bool) -> Value {
    let k = fit.k_vars;
    let cols = k + 1;
    if !stats {
        let mut row: Vec<Value> = Vec::with_capacity(cols);
        for j in 0..k {
            let s = fit.slopes[k - 1 - j];
            row.push(Value::Number(if exp_coefs { s.exp() } else { s }));
        }
        let b = fit.intercept;
        row.push(Value::Number(if exp_coefs { b.exp() } else { b }));
        return Value::Array(Arc::new(ArrayData::new(1, cols as u32, row)));
    }
    let mut data: Vec<Value> = Vec::with_capacity(5 * cols);
    // Row 0: slopes reversed + intercept (exp-transformed for LOGEST).
    for j in 0..k {
        let s = fit.slopes[k - 1 - j];
        data.push(Value::Number(if exp_coefs { s.exp() } else { s }));
    }
    data.push(Value::Number(if exp_coefs {
        fit.intercept.exp()
    } else {
        fit.intercept
    }));
    // Row 1: SEs (always log-space for LOGEST per Excel reference).
    for j in 0..k {
        data.push(Value::Number(fit.se[k - 1 - j]));
    }
    data.push(Value::Number(fit.se_intercept));
    // Row 2: R², SE_y.
    let r2 = if fit.ss_tot > 0.0 {
        1.0 - fit.ss_res / fit.ss_tot
    } else {
        0.0
    };
    let se_y = if fit.df > 0.0 {
        (fit.ss_res / fit.df).sqrt()
    } else {
        0.0
    };
    data.push(Value::Number(r2));
    data.push(Value::Number(se_y));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    // Row 3: F-stat, df.
    let p = k as f64;
    let f_stat = if p > 0.0 && fit.df > 0.0 && fit.ss_res > 0.0 {
        let ss_reg = if fit.ss_tot > fit.ss_res {
            fit.ss_tot - fit.ss_res
        } else {
            0.0
        };
        (ss_reg / p) / (fit.ss_res / fit.df)
    } else {
        0.0
    };
    data.push(Value::Number(f_stat));
    data.push(Value::Number(fit.df));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    // Row 4: SS_reg, SS_resid.
    let ss_reg = if fit.ss_tot > fit.ss_res {
        fit.ss_tot - fit.ss_res
    } else {
        0.0
    };
    data.push(Value::Number(ss_reg));
    data.push(Value::Number(fit.ss_res));
    for _ in 2..cols {
        data.push(Value::Error(ValueError::NotAvailable));
    }
    Value::Array(Arc::new(ArrayData::new(5, cols as u32, data)))
}
