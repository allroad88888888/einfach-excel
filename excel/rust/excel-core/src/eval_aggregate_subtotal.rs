use super::*;

pub(super) fn fn_subtotal(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let f_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = f_v {
        return Value::Error(e);
    }
    let fn_raw = match coerce_to_number(&f_v) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    if !fn_raw.is_finite() {
        return Value::Error(ValueError::InvalidValue);
    }
    let fn_int = fn_raw.trunc() as i64;
    // Excel's two-layer rule (`design-filter-hidden-rows` §2/§6.3): BOTH
    // layers exclude the host's FILTER-hidden rows; only 101-111 additionally
    // exclude MANUALLY hidden rows. Both sets are read purely as evaluation
    // input — the engine models no hidden state and never infers a row's
    // source.
    let (fn_norm, policy) = if (1..=11).contains(&fn_int) {
        (fn_int as u32, SubtotalHiddenPolicy::ExcludeFilter)
    } else if (101..=111).contains(&fn_int) {
        (
            (fn_int - 100) as u32,
            SubtotalHiddenPolicy::ExcludeFilterAndManual,
        )
    } else {
        return Value::Error(ValueError::InvalidValue);
    };
    run_subtotal(fn_norm, &args[1..], provider, policy)
}
