use super::*;

pub(super) fn stat_confidence_norm(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let alpha = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let stdev = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size_raw = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let size = size_raw.trunc();
    if !(alpha > 0.0 && alpha < 1.0) || !(stdev > 0.0) || size < 1.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    let z = dist.inverse_cdf(1.0 - alpha / 2.0);
    stat_finite(z * stdev / size.sqrt())
}

/// Mean and sample variance (divisor `n - 1`) of a flat slice. Returns
/// `None` if fewer than two values were given.
pub(super) fn mean_and_sample_var(xs: &[f64]) -> Option<(f64, f64)> {
    let n = xs.len();
    if n < 2 {
        return None;
    }
    let mean = xs.iter().sum::<f64>() / n as f64;
    let var = xs.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (n as f64 - 1.0);
    Some((mean, var))
}

/// `CHISQ.TEST(actual_range, expected_range)` / `CHITEST(...)`.
///
/// Computes the chi-square statistic
///   `χ² = Σ (actual_i - expected_i)² / expected_i`
/// over every paired-cell of the two equally-shaped grids, then returns
/// the right-tail probability of that statistic under a chi-square
/// distribution with `(rows - 1) * (cols - 1)` degrees of freedom (or
/// `n - 1` if either dimension is 1). Empty / non-numeric cells in a
/// pair are skipped (must skip in both); a zero expected value surfaces
/// `#DIV/0!`. Mismatched shapes surface `#N/A` (`InvalidValue`).
pub(super) fn stat_chisq_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ChiSquared, ContinuousCDF};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let grid_a = match collect_range_2d_for_arg(&args[0], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let grid_b = match collect_range_2d_for_arg(&args[1], provider) {
        Some(g) => g,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let rows = grid_a.len();
    let cols = grid_a.first().map(|r| r.len()).unwrap_or(0);
    if rows != grid_b.len() || cols != grid_b.first().map(|r| r.len()).unwrap_or(0) {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut chi2 = 0.0_f64;
    let mut pairs: usize = 0;
    for r in 0..rows {
        for c in 0..cols {
            let av = &grid_a[r][c];
            let bv = &grid_b[r][c];
            if let Value::Error(e) = av {
                return Value::Error(e.clone());
            }
            if let Value::Error(e) = bv {
                return Value::Error(e.clone());
            }
            if let (Value::Number(a_n), Value::Number(b_n)) = (av, bv) {
                if *b_n == 0.0 {
                    return Value::Error(ValueError::DivisionByZero);
                }
                let diff = a_n - b_n;
                chi2 += diff * diff / b_n;
                pairs += 1;
            }
        }
    }
    if pairs < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    // Degrees of freedom: contingency-table convention. Single row or
    // column -> n-1; otherwise (rows-1)*(cols-1).
    let df = if rows == 1 || cols == 1 {
        (pairs as f64) - 1.0
    } else {
        ((rows - 1) as f64) * ((cols - 1) as f64)
    };
    if df <= 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let dist = match ChiSquared::new(df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    stat_finite(1.0 - dist.cdf(chi2))
}

/// `F.TEST(arr1, arr2)` / `FTEST(...)`. Two-tail probability that two
/// samples have equal variance: `2 * min(P, 1-P)` where `P` is the F
/// distribution's right-tail probability at `var1 / var2` with
/// `(n1 - 1, n2 - 1)` degrees of freedom.
pub(super) fn stat_f_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, FisherSnedecor};
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xs = collect_numbers(&[args[0].clone()], provider);
    let ys = collect_numbers(&[args[1].clone()], provider);
    let (_, var_x) = match mean_and_sample_var(&xs) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    let (_, var_y) = match mean_and_sample_var(&ys) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    if var_x == 0.0 || var_y == 0.0 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let df1 = (xs.len() as f64) - 1.0;
    let df2 = (ys.len() as f64) - 1.0;
    let f = var_x / var_y;
    let dist = match FisherSnedecor::new(df1, df2) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    let p_right = 1.0 - dist.cdf(f);
    stat_finite(2.0 * p_right.min(1.0 - p_right))
}

/// `T.TEST(arr1, arr2, tails, type)` / `TTEST(...)`.
///
/// `type`:
///   1. Paired (arrays must be equal length, neither variance zero).
///   2. Two-sample, equal variance (pooled).
///   3. Two-sample, unequal variance (Welch's).
///
/// `tails`: 1 or 2.
pub(super) fn stat_t_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, StudentsT};
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let tails_raw = match stat_num(&args[2], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let type_raw = match stat_num(&args[3], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if tails_raw.trunc() != tails_raw || type_raw.trunc() != type_raw {
        return Value::Error(ValueError::Overflow);
    }
    let tails = tails_raw as i64;
    let ttype = type_raw as i64;
    if (tails != 1 && tails != 2) || !(1..=3).contains(&ttype) {
        return Value::Error(ValueError::Overflow);
    }

    let (t_stat, df) = match ttype {
        1 => {
            // Paired t-test. Pair grids cell-by-cell (numeric pairs
            // only); skip pairs where either side is non-numeric.
            let pairs = match collect_paired_numbers(&args[0], &args[1], provider) {
                Ok(p) => p,
                Err(e) => return Value::Error(e),
            };
            let n = pairs.len();
            if n < 2 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let diffs: Vec<f64> = pairs.iter().map(|(x, y)| x - y).collect();
            let (mean, var) = match mean_and_sample_var(&diffs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            if var == 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let se = (var / n as f64).sqrt();
            (mean / se, (n as f64) - 1.0)
        }
        2 => {
            // Two-sample equal-variance (pooled).
            let xs = collect_numbers(&[args[0].clone()], provider);
            let ys = collect_numbers(&[args[1].clone()], provider);
            let (mx, vx) = match mean_and_sample_var(&xs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let (my, vy) = match mean_and_sample_var(&ys) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let n1 = xs.len() as f64;
            let n2 = ys.len() as f64;
            let pooled = ((n1 - 1.0) * vx + (n2 - 1.0) * vy) / (n1 + n2 - 2.0);
            if pooled <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let se = (pooled * (1.0 / n1 + 1.0 / n2)).sqrt();
            ((mx - my) / se, n1 + n2 - 2.0)
        }
        3 => {
            // Welch's two-sample unequal-variance t-test.
            let xs = collect_numbers(&[args[0].clone()], provider);
            let ys = collect_numbers(&[args[1].clone()], provider);
            let (mx, vx) = match mean_and_sample_var(&xs) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let (my, vy) = match mean_and_sample_var(&ys) {
                Some(t) => t,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            let n1 = xs.len() as f64;
            let n2 = ys.len() as f64;
            let se_sq = vx / n1 + vy / n2;
            if se_sq <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            let t = (mx - my) / se_sq.sqrt();
            // Welch-Satterthwaite df.
            let df_num = se_sq.powi(2);
            let df_den = (vx / n1).powi(2) / (n1 - 1.0) + (vy / n2).powi(2) / (n2 - 1.0);
            if df_den <= 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            (t, df_num / df_den)
        }
        _ => unreachable!(),
    };
    if !df.is_finite() || df <= 0.0 {
        return Value::Error(ValueError::Overflow);
    }
    let dist = match StudentsT::new(0.0, 1.0, df) {
        Ok(d) => d,
        Err(_) => return Value::Error(ValueError::Overflow),
    };
    // Two-tail probability is `2 * P(T > |t_stat|)`; one-tail is
    // `P(T > |t_stat|)`. Using `1 - cdf(|t|)` covers both signs.
    let p_one = 1.0 - dist.cdf(t_stat.abs());
    stat_finite(if tails == 1 { p_one } else { 2.0 * p_one })
}

/// `Z.TEST(array, x, [sigma])` / `ZTEST(...)`. Returns the one-tailed
/// P-value `1 - NORM.S.DIST((mean - x) / (sigma / sqrt(n)))`. When
/// `sigma` is omitted the sample standard deviation is used.
pub(super) fn stat_z_test(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    use statrs::distribution::{ContinuousCDF, Normal};
    if !(2..=3).contains(&args.len()) {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xs = collect_numbers(&[args[0].clone()], provider);
    let n = xs.len();
    if n < 2 {
        return Value::Error(ValueError::DivisionByZero);
    }
    let x0 = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let (mean, var) = match mean_and_sample_var(&xs) {
        Some(t) => t,
        None => return Value::Error(ValueError::DivisionByZero),
    };
    let sigma = if args.len() == 3 {
        match stat_num(&args[2], provider) {
            Ok(n) => n,
            Err(e) => return e,
        }
    } else {
        var.sqrt()
    };
    if !(sigma > 0.0) {
        return Value::Error(ValueError::DivisionByZero);
    }
    let z = (mean - x0) / (sigma / (n as f64).sqrt());
    let dist = Normal::new(0.0, 1.0).expect("standard normal always constructs");
    stat_finite(1.0 - dist.cdf(z))
}
