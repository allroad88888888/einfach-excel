use super::*;

pub(super) fn fn_forecast(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = xv {
        return Value::Error(e);
    }
    let x_at = match coerce_to_number(&xv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let (ys, _y_vertical) = match extract_known_y(&args[1], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let m_x = match arg_to_f64_matrix(&args[2], provider) {
        Ok(m) if !m.is_empty() => m,
        Ok(_) => return Value::Error(ValueError::InvalidValue),
        Err(e) => return Value::Error(e),
    };
    let xs_vec = match matrix_to_vector_strict(&m_x) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };
    if xs_vec.len() != ys.len() {
        return Value::Error(ValueError::InvalidValue);
    }
    let xs: Vec<Vec<f64>> = xs_vec.iter().map(|x| vec![*x]).collect();
    let fit = match linreg_core(&xs, &ys, true) {
        Ok(f) => f,
        Err(e) => return Value::Error(e),
    };
    let m1 = fit.slopes.first().copied().unwrap_or(0.0);
    Value::Number(fit.intercept + m1 * x_at)
}

/// STEYX(known_y, known_x). Standard error of the predicted y in a
/// simple linear regression.
pub(super) fn fn_steyx(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[1], &args[0], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 3 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxx = 0.0;
    let mut syy = 0.0;
    let mut sxy = 0.0;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxx += dx * dx;
        syy += dy * dy;
        sxy += dx * dy;
    }
    if sxx == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let val = ((syy - sxy * sxy / sxx) / (n - 2.0)).max(0.0);
    Value::Number(val.sqrt())
}

/// RSQ(known_y, known_x). Pearson R² — square of the correlation.
pub(super) fn fn_rsq(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
        Ok(p) => p,
        Err(e) => return Value::Error(e),
    };
    if pairs.len() < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let n = pairs.len() as f64;
    let mx = pairs.iter().map(|(x, _)| *x).sum::<f64>() / n;
    let my = pairs.iter().map(|(_, y)| *y).sum::<f64>() / n;
    let mut sxy = 0.0;
    let mut sxx = 0.0;
    let mut syy = 0.0;
    for (x, y) in &pairs {
        let dx = *x - mx;
        let dy = *y - my;
        sxy += dx * dy;
        sxx += dx * dx;
        syy += dy * dy;
    }
    let denom = sxx * syy;
    if denom == 0.0 || !denom.is_finite() {
        return Value::Error(ValueError::DivisionByZero);
    }
    Value::Number((sxy * sxy) / denom)
}
