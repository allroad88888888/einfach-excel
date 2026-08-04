use super::*;

pub(super) fn convert_temperature(value: f64, from_tag: f64, to_tag: f64) -> f64 {
    // Go via Celsius as the pivot.
    let c = match from_tag as i32 {
        0 => value,                      // C
        1 => (value - 32.0) * 5.0 / 9.0, // F -> C
        2 => value - 273.15,             // K -> C
        _ => f64::NAN,
    };
    match to_tag as i32 {
        0 => c,                    // C
        1 => c * 9.0 / 5.0 + 32.0, // C -> F
        2 => c + 273.15,           // C -> K
        _ => f64::NAN,
    }
}

pub(super) fn eval_convert(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let value = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !value.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let from_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = from_v {
        return Value::Error(e);
    }
    let to_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = to_v {
        return Value::Error(e);
    }
    let from_unit = coerce_to_text(&from_v);
    let to_unit = coerce_to_text(&to_v);

    let (from_cat, from_factor) = match convert_unit_factor(&from_unit) {
        Some(t) => t,
        None => return Value::Error(ValueError::InvalidValue),
    };
    let (to_cat, to_factor) = match convert_unit_factor(&to_unit) {
        Some(t) => t,
        None => return Value::Error(ValueError::InvalidValue),
    };
    if from_cat != to_cat {
        return Value::Error(ValueError::InvalidValue);
    }
    let result = if from_cat == ConvertCategory::Temperature {
        convert_temperature(value, from_factor, to_factor)
    } else {
        // Linear: value (in `from`) -> base unit -> target unit.
        value * from_factor / to_factor
    };
    stat_finite(result)
}
