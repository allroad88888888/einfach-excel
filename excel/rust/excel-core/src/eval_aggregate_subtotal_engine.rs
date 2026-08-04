use super::*;

pub(super) fn run_subtotal(
    fn_num: u32,
    data_args: &[Expr],
    provider: &dyn EvalProvider,
    policy: SubtotalHiddenPolicy,
) -> Value {
    match fn_num {
        // 1: AVERAGE
        1 => {
            let mut total = 0.0_f64;
            let mut count = 0u64;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            total += n;
                            count += 1;
                        }
                        _ => {}
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
        // 2: COUNT (numerics only)
        2 => {
            let mut count = 0u64;
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if matches!(v, Value::Number(_)) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        // 3: COUNTA (non-null)
        3 => {
            let mut count = 0u64;
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if !matches!(v, Value::Null) {
                        count += 1;
                    }
                });
            }
            Value::Number(count as f64)
        }
        // 4: MAX
        4 => {
            let mut max: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            max = Some(max.map_or(n, |m: f64| m.max(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            max.map_or(Value::Number(0.0), Value::Number)
        }
        // 5: MIN
        5 => {
            let mut min: Option<f64> = None;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            min = Some(min.map_or(n, |m: f64| m.min(n)));
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                return Value::Error(e);
            }
            min.map_or(Value::Number(0.0), Value::Number)
        }
        // 6: PRODUCT
        6 => {
            let mut product = 1.0_f64;
            let mut saw_number = false;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => {
                            product *= n;
                            saw_number = true;
                        }
                        _ => {}
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_number {
                Value::Number(0.0)
            } else {
                Value::Number(product)
            }
        }
        // 7: STDEV / 8: STDEVP / 10: VAR / 11: VARP
        7 | 8 | 10 | 11 => {
            // Inline the numeric collection (rather than `collect_numbers`) so
            // the hidden-row exclusion layers onto the same streaming path;
            // `IncludeAll` collects everything, exactly as before.
            let mut nums = Vec::new();
            for arg in data_args {
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if let Value::Number(n) = v {
                        nums.push(n);
                    }
                });
            }
            let is_sample = matches!(fn_num, 7 | 10);
            let min_n = if is_sample { 2 } else { 1 };
            if nums.len() < min_n {
                return Value::Error(ValueError::DivisionByZero);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let denom = if is_sample {
                (nums.len() - 1) as f64
            } else {
                nums.len() as f64
            };
            let var = nums.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / denom;
            let is_stdev = matches!(fn_num, 7 | 8);
            Value::Number(if is_stdev { var.sqrt() } else { var })
        }
        // 9: SUM
        9 => {
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in data_args {
                if err.is_some() {
                    break;
                }
                let hidden = subtotal_hidden_for_arg(arg, provider, policy);
                for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n,
                        _ => {}
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                None => Value::Number(total),
            }
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}
