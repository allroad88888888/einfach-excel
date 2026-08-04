//! Dispatches statistics descriptive formula functions.

use super::*;

pub(super) fn eval_fn_statistics_descriptive(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"AVERAGEA" => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        Value::Boolean(true) => {
                            total += 1.0;
                            count += 1;
                        }
                        Value::Boolean(false) => {
                            count += 1;
                        }
                        Value::Text(_) => {
                            // Text contributes 0 to total but counts in denominator.
                            count += 1;
                        }
                        Value::Null => {
                            // Null (empty cell) is not counted at all.
                        }
                        // Unreachable: for_each_arg_value flattens Array.
                        Value::Array(_) => {}
                        // Lambda inside AVERAGEA is a type error.
                        Value::Lambda(_) => err = Some(ValueError::WrongType),
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if count == 0 {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(total / count as f64)
            }
        }

        // RANK(value, range[, order]) — equivalent to Excel's RANK / RANK.EQ.
        // order = 0 (default) → descending (rank 1 = largest).
        // order ≠ 0 → ascending (rank 1 = smallest).
        // Ties all share the same (lowest) rank.
        // If `value` is not present in `range`, returns #VALUE! (Excel uses #N/A
        // which has no direct equivalent in ValueError).
        //
        // Dotted names (Excel 2010+): `RANK.EQ` aliases `RANK`/`RANKEQ`.
        "RANK" | "RANKEQ" | "RANK.EQ" => rank_eq(args, provider),

        // RANKAVG(value, range[, order]) — Excel's RANK.AVG. Tied values get the
        // average of the ranks they span (e.g. three values tied for rank 5 → all
        // get 6.0, because they would occupy ranks 5, 6, 7).
        "RANKAVG" | "RANK.AVG" => rank_avg(args, provider),

        // PERCENTILE(range, k) — linear-interpolated percentile.
        // k in [0, 1]; otherwise #VALUE!. Empty range → #VALUE!.
        // `PERCENTILE.INC` (Excel 2010+) is the same function.
        "PERCENTILE" | "PERCENTILE.INC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let k_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            percentile_impl(&args[..1], provider, k)
        }

        // PERCENTILE.EXC(range, k) — exclusive percentile. k strictly in (0, 1);
        // k=0 / k=1 → #VALUE!. The 1-based position is `k * (n + 1)`; if the
        // resulting position is < 1 or > n the result is #VALUE!. Otherwise
        // interpolates between the two surrounding sorted values.
        "PERCENTILE.EXC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let k_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = k_v {
                return Value::Error(e);
            }
            let k = match coerce_to_number(&k_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            percentile_exc_impl(&args[..1], provider, k)
        }

        // QUARTILE(range, quart) — quart ∈ {0,1,2,3,4} → PERCENTILE(range, quart/4).
        // `QUARTILE.INC` is the same function under Excel 2010+ naming.
        "QUARTILE" | "QUARTILE.INC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let q_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = q_v {
                return Value::Error(e);
            }
            let q = match coerce_to_number(&q_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // quart must be in 0..=4 inclusive.
            if !q.is_finite() || q < 0.0 || q > 4.0 || q.trunc() != q {
                return Value::Error(ValueError::InvalidValue);
            }
            percentile_impl(&args[..1], provider, q / 4.0)
        }

        // QUARTILE.EXC(range, quart) — exclusive quartile. quart must be 1, 2,
        // or 3 (0 and 4 are NOT valid in exclusive mode). Equivalent to
        // PERCENTILE.EXC(range, quart/4).
        "QUARTILE.EXC" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let q_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = q_v {
                return Value::Error(e);
            }
            let q = match coerce_to_number(&q_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // quart must be 1, 2, or 3 (integer).
            if !q.is_finite() || q.trunc() != q {
                return Value::Error(ValueError::InvalidValue);
            }
            let qi = q as i64;
            if !(1..=3).contains(&qi) {
                return Value::Error(ValueError::InvalidValue);
            }
            percentile_exc_impl(&args[..1], provider, qi as f64 / 4.0)
        }

        // STDEV.S / VAR.S — Excel 2010+ aliases for the sample-variance
        // STDEV / VAR (divide by n-1).
        "STDEV.S" => eval_func("STDEV", args, provider),
        "VAR.S" => eval_func("VAR", args, provider),

        // STDEV.P / VAR.P — population standard deviation / variance.
        // Divide by n (not n-1).
        "STDEV.P" => {
            let nums = collect_numbers(args, provider);
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64);
            Value::Number(var.sqrt())
        }
        "VAR.P" => {
            let nums = collect_numbers(args, provider);
            if nums.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / (nums.len() as f64);
            Value::Number(var)
        }

        // CORREL(arr1, arr2) — Pearson correlation. Both args must be ranges of
        // the same shape (same width × height). Pairs are collected only when
        // BOTH cells at the same offset are numeric. Need ≥ 2 pairs.
        // Shape mismatch → #VALUE!. Denominator 0 → #DIV/0!.
        //
        // Note: requires literal Range / SheetRange / OFFSET expressions (the
        // shape requirement is structural). Non-range args → #VALUE!.
        "CORREL" => correl_impl(args, provider),

        // COVAR / COVAR.P — population covariance. `sum((x-mx)*(y-my)) / n`.
        // Same pair-collection semantics as CORREL.
        "COVAR" | "COVAR.P" => covar_impl(args, provider, false),

        // COVAR.S — sample covariance. Divides by `n - 1` instead of `n`.
        "COVAR.S" => covar_impl(args, provider, true),

        // SLOPE(y_array, x_array) — linear regression slope. Order matters: y
        // first, then x (Excel convention).
        "SLOPE" => slope_intercept_impl(args, provider, false),

        // INTERCEPT(y_array, x_array) — ȳ - slope * x̄.
        "INTERCEPT" => slope_intercept_impl(args, provider, true),

        // === Financial / time-value-of-money ===
        //
        // All annuity formulas use the Excel sign convention: outflows are
        // negative, inflows positive. The core equation when `rate != 0`:
        //
        //   pv*(1+r)^n + pmt*(1+r*type)*((1+r)^n - 1)/r + fv = 0
        //
        // Specialised to `rate == 0` (linear): pv + pmt*n + fv = 0.
        // `type` is 0 (end-of-period, default) or 1 (beginning-of-period).
                _ => unreachable!(),
    }
}
