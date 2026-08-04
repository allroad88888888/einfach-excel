use super::*;

/// AGGREGATE(function_num, options, ref1, [ref2…]).
pub(super) fn fn_aggregate(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let function_value = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(error) = function_value {
        return Value::Error(error);
    }
    let function_number = match coerce_to_number(&function_value) {
        Some(number) if number.is_finite() => number.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if !(1..=19).contains(&function_number) {
        return Value::Error(ValueError::InvalidValue);
    }
    let options_value = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(error) = options_value {
        return Value::Error(error);
    }
    let options = match coerce_to_number(&options_value) {
        Some(number) if number.is_finite() => number.trunc() as i64,
        _ => return Value::Error(ValueError::WrongType),
    };
    if !(0..=7).contains(&options) {
        return Value::Error(ValueError::InvalidValue);
    }

    // Microsoft's AGGREGATE option bits: bit 0 ignores both hidden row
    // sources, and bit 1 ignores errors. Bit 2 controls nested aggregate
    // inclusion rather than error propagation.
    let ignore_errors = (options & 2) != 0;
    let hidden_policy = if (options & 1) != 0 {
        SubtotalHiddenPolicy::ExcludeFilterAndManual
    } else {
        SubtotalHiddenPolicy::IncludeAll
    };
    let (data_args, k_arg) = if (14..=19).contains(&function_number) {
        if args.len() < 4 {
            return Value::Error(ValueError::WrongArgCount);
        }
        let split = args.len() - 1;
        (&args[2..split], Some(&args[split]))
    } else {
        (&args[2..], None)
    };

    match function_number {
        1..=13 => aggregate_basic(
            function_number,
            data_args,
            provider,
            hidden_policy,
            ignore_errors,
        ),
        14..=19 => aggregate_ordered(
            function_number,
            data_args,
            k_arg.expect("ordered aggregate requires k argument"),
            provider,
            hidden_policy,
            ignore_errors,
        ),
        _ => Value::Error(ValueError::InvalidValue),
    }
}
