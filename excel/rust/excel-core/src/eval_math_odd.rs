use super::*;

pub(super) fn fn_odd(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&v) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    if n == 0.0 {
        return Value::Number(1.0);
    }
    let sign = if n < 0.0 { -1.0 } else { 1.0 };
    let absn = n.abs();
    let mut rounded = absn.ceil();
    if (rounded as i64) % 2 == 0 {
        rounded += 1.0;
    }
    Value::Number(sign * rounded)
}
