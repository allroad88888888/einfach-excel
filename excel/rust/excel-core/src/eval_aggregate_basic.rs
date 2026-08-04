use super::*;

pub(super) fn aggregate_basic(
    function_number: i64,
    data_args: &[Expr],
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Value {
    if function_number <= 11 && !ignore_errors {
        return run_subtotal(
            function_number as u32,
            data_args,
            provider,
            hidden_policy,
        );
    }

    let nums = match collect_aggregate_numbers(
        data_args,
        provider,
        hidden_policy,
        ignore_errors,
    ) {
        Ok(values) => values,
        Err(error) => return Value::Error(error),
    };
    match function_number {
        1 => {
            if nums.is_empty() {
                Value::Error(ValueError::DivisionByZero)
            } else {
                Value::Number(nums.iter().sum::<f64>() / nums.len() as f64)
            }
        }
        2 => Value::Number(nums.len() as f64),
        3 => Value::Number(count_aggregate_non_errors(
            data_args,
            provider,
            hidden_policy,
        ) as f64),
        4 => nums
            .iter()
            .copied()
            .fold(None::<f64>, |acc, number| {
                Some(acc.map_or(number, |maximum| maximum.max(number)))
            })
            .map_or(Value::Number(0.0), Value::Number),
        5 => nums
            .iter()
            .copied()
            .fold(None::<f64>, |acc, number| {
                Some(acc.map_or(number, |minimum| minimum.min(number)))
            })
            .map_or(Value::Number(0.0), Value::Number),
        6 => {
            if nums.is_empty() {
                Value::Number(0.0)
            } else {
                Value::Number(nums.iter().product())
            }
        }
        7 | 8 | 10 | 11 => {
            let is_sample = matches!(function_number, 7 | 10);
            let min_count = if is_sample { 2 } else { 1 };
            if nums.len() < min_count {
                return Value::Error(ValueError::DivisionByZero);
            }
            let mean = nums.iter().sum::<f64>() / nums.len() as f64;
            let denominator = if is_sample {
                (nums.len() - 1) as f64
            } else {
                nums.len() as f64
            };
            let variance = nums
                .iter()
                .map(|number| (number - mean).powi(2))
                .sum::<f64>()
                / denominator;
            let is_stdev = matches!(function_number, 7 | 8);
            Value::Number(if is_stdev {
                variance.sqrt()
            } else {
                variance
            })
        }
        9 => Value::Number(nums.iter().sum::<f64>()),
        12 => aggregate_median(nums),
        13 => aggregate_mode(nums),
        _ => Value::Error(ValueError::InvalidValue),
    }
}

fn aggregate_median(mut nums: Vec<f64>) -> Value {
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    nums.sort_by(|left, right| {
        left.partial_cmp(right)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let len = nums.len();
    let middle = if len % 2 == 1 {
        nums[len / 2]
    } else {
        (nums[len / 2 - 1] + nums[len / 2]) / 2.0
    };
    Value::Number(middle)
}

fn aggregate_mode(nums: Vec<f64>) -> Value {
    if nums.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut best_value = nums[0];
    let mut best_count = 0usize;
    for (index, &value) in nums.iter().enumerate() {
        let mut count = 1usize;
        for &candidate in &nums[index + 1..] {
            if candidate == value {
                count += 1;
            }
        }
        if count > best_count {
            best_count = count;
            best_value = value;
        }
    }
    if best_count <= 1 {
        Value::Error(ValueError::InvalidValue)
    } else {
        Value::Number(best_value)
    }
}
