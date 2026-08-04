use super::*;

pub(super) fn fn_linest(args: &[Expr], provider: &dyn EvalProvider, log_y: bool) -> Value {
    if args.is_empty() || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (mut ys, y_vertical) = match extract_known_y(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if log_y {
        for y in ys.iter_mut() {
            if !(*y > 0.0) {
                return Value::Error(ValueError::Overflow);
            }
            *y = y.ln();
        }
    }
    let n = ys.len();
    let x_arg = if args.len() >= 2 {
        Some(&args[1])
    } else {
        None
    };
    let xs = match extract_known_x(x_arg, n, y_vertical, provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let (with_intercept, stats) = match linest_flags(args, 2, provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let fit = match linreg_core(&xs, &ys, with_intercept) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    linest_array(&fit, stats, /* exp_coefs = */ log_y)
}

/// TREND(known_y, [known_x], [new_x], [const]).
/// GROWTH is the same shape with `log_y = true`.
pub(super) fn fn_trend_growth(args: &[Expr], provider: &dyn EvalProvider, log_y: bool) -> Value {
    if args.is_empty() || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (mut ys, y_vertical) = match extract_known_y(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if log_y {
        for y in ys.iter_mut() {
            if !(*y > 0.0) {
                return Value::Error(ValueError::Overflow);
            }
            *y = y.ln();
        }
    }
    let n = ys.len();
    let x_arg = if args.len() >= 2 {
        Some(&args[1])
    } else {
        None
    };
    let xs = match extract_known_x(x_arg, n, y_vertical, provider) {
        Ok(m) => m,
        Err(e) => return Value::Error(e),
    };
    let with_intercept = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        coerce_to_bool(&v).unwrap_or(true)
    } else {
        true
    };
    let fit = match linreg_core(&xs, &ys, with_intercept) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    let new_xs: Vec<Vec<f64>> = if args.len() >= 3 {
        match arg_to_f64_matrix(&args[2], provider) {
            Ok(m) if !m.is_empty() => {
                let rows = m.len();
                let cols = m[0].len();
                let k = fit.k_vars;
                let (n_new, k_new, transpose) = if cols == k {
                    (rows, cols, false)
                } else if rows == k {
                    (cols, rows, true)
                } else if k == 1 && (rows == 1 || cols == 1) {
                    if rows == 1 {
                        (cols, 1, true)
                    } else {
                        (rows, 1, false)
                    }
                } else {
                    return Value::Error(ValueError::InvalidValue);
                };
                let mut out: Vec<Vec<f64>> = vec![vec![0.0; k_new]; n_new];
                for r in 0..n_new {
                    for c in 0..k_new {
                        out[r][c] = if transpose { m[c][r] } else { m[r][c] };
                    }
                }
                out
            }
            Ok(_) => xs.clone(),
            Err(e) => return Value::Error(e),
        }
    } else {
        xs.clone()
    };
    let n_new = new_xs.len();
    let mut preds: Vec<Value> = Vec::with_capacity(n_new);
    for r in 0..n_new {
        let mut yhat = 0.0;
        for c in 0..fit.k_vars {
            yhat += new_xs[r][c] * fit.slopes[c];
        }
        if fit.with_intercept {
            yhat += fit.intercept;
        }
        if log_y {
            yhat = yhat.exp();
        }
        preds.push(Value::Number(yhat));
    }
    if y_vertical {
        Value::Array(Arc::new(ArrayData::new(n_new as u32, 1, preds)))
    } else {
        Value::Array(Arc::new(ArrayData::new(1, n_new as u32, preds)))
    }
}
