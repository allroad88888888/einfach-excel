use super::*;

pub(super) fn eval_bessel(
    args: &[Expr],
    provider: &dyn EvalProvider,
    kernel: fn(f64, i64) -> Option<f64>,
) -> Value {
    if args.len() != 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let x = match stat_num(&args[0], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    let n_raw = match stat_num(&args[1], provider) {
        Ok(n) => n,
        Err(e) => return e,
    };
    if !x.is_finite() || !n_raw.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    let n = n_raw.trunc() as i64;
    if n < 0 {
        return Value::Error(ValueError::Overflow);
    }
    match kernel(x, n) {
        Some(r) if r.is_finite() => Value::Number(r),
        _ => Value::Error(ValueError::Overflow),
    }
}
