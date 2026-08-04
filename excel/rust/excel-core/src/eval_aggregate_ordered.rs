use super::*;

pub(super) fn aggregate_ordered(
    function_number: i64,
    data_args: &[Expr],
    k_arg: &Expr,
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Value {
    match function_number {
        14 | 15 => aggregate_large_small(
            function_number,
            data_args,
            k_arg,
            provider,
            hidden_policy,
            ignore_errors,
        ),
        16 | 18 => aggregate_percentile(
            function_number,
            data_args,
            k_arg,
            provider,
            hidden_policy,
            ignore_errors,
        ),
        17 | 19 => aggregate_quartile(
            function_number,
            data_args,
            k_arg,
            provider,
            hidden_policy,
            ignore_errors,
        ),
        _ => Value::Error(ValueError::InvalidValue),
    }
}

fn aggregate_large_small(
    function_number: i64,
    data_args: &[Expr],
    k_arg: &Expr,
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Value {
    let mut numbers = match collect_aggregate_numbers(
        data_args,
        provider,
        hidden_policy,
        ignore_errors,
    ) {
        Ok(values) => values,
        Err(error) => return Value::Error(error),
    };
    let k_value = eval_expr_with_provider(k_arg, provider);
    if let Value::Error(error) = k_value {
        return Value::Error(error);
    }
    let k = match coerce_to_number(&k_value) {
        Some(number) if number >= 1.0 => number as usize,
        _ => return Value::Error(ValueError::WrongType),
    };
    if k > numbers.len() {
        return Value::Error(ValueError::InvalidValue);
    }
    numbers.sort_by(|left, right| {
        let ordering = left
            .partial_cmp(right)
            .unwrap_or(std::cmp::Ordering::Equal);
        if function_number == 14 {
            ordering.reverse()
        } else {
            ordering
        }
    });
    Value::Number(numbers[k - 1])
}

fn aggregate_percentile(
    function_number: i64,
    data_args: &[Expr],
    k_arg: &Expr,
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Value {
    let k_value = eval_expr_with_provider(k_arg, provider);
    if let Value::Error(error) = k_value {
        return Value::Error(error);
    }
    let k = match coerce_to_number(&k_value) {
        Some(number) => number,
        _ => return Value::Error(ValueError::WrongType),
    };
    let numbers = match collect_aggregate_numbers(
        data_args,
        provider,
        hidden_policy,
        ignore_errors,
    ) {
        Ok(values) => values,
        Err(error) => return Value::Error(error),
    };
    percentile_value(numbers, k, function_number == 16)
}

fn aggregate_quartile(
    function_number: i64,
    data_args: &[Expr],
    k_arg: &Expr,
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Value {
    let k_value = eval_expr_with_provider(k_arg, provider);
    if let Value::Error(error) = k_value {
        return Value::Error(error);
    }
    let quartile = match coerce_to_number(&k_value) {
        Some(number) if number.is_finite() && number.trunc() == number => number as i64,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    if function_number == 17 {
        if !(0..=4).contains(&quartile) {
            return Value::Error(ValueError::InvalidValue);
        }
    } else if !(1..=3).contains(&quartile) {
        return Value::Error(ValueError::InvalidValue);
    }
    let numbers = match collect_aggregate_numbers(
        data_args,
        provider,
        hidden_policy,
        ignore_errors,
    ) {
        Ok(values) => values,
        Err(error) => return Value::Error(error),
    };
    percentile_value(numbers, quartile as f64 / 4.0, function_number == 17)
}

fn percentile_value(mut numbers: Vec<f64>, k: f64, inclusive: bool) -> Value {
    if numbers.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    numbers.sort_by(|left, right| {
        left.partial_cmp(right)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    if inclusive {
        if !k.is_finite() || !(0.0..=1.0).contains(&k) {
            return Value::Error(ValueError::InvalidValue);
        }
        interpolate_percentile(&numbers, k * (numbers.len() as f64 - 1.0))
    } else {
        if !k.is_finite() || k <= 0.0 || k >= 1.0 {
            return Value::Error(ValueError::InvalidValue);
        }
        let position = k * (numbers.len() as f64 + 1.0);
        if position < 1.0 || position > numbers.len() as f64 {
            return Value::Error(ValueError::InvalidValue);
        }
        interpolate_percentile(&numbers, position - 1.0)
    }
}

fn interpolate_percentile(numbers: &[f64], zero_based_position: f64) -> Value {
    let lower = zero_based_position.floor() as usize;
    let upper = zero_based_position.ceil() as usize;
    if lower == upper {
        Value::Number(numbers[lower])
    } else {
        let fraction = zero_based_position - lower as f64;
        Value::Number(numbers[lower] + (numbers[upper] - numbers[lower]) * fraction)
    }
}
