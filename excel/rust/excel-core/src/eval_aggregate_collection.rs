use super::*;

pub(super) fn collect_aggregate_numbers(
    args: &[Expr],
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
    ignore_errors: bool,
) -> Result<Vec<f64>, ValueError> {
    let mut out = Vec::new();
    let mut err: Option<ValueError> = None;
    for arg in args {
        if err.is_some() {
            break;
        }
        let hidden = subtotal_hidden_for_arg(arg, provider, hidden_policy);
        for_each_subtotal_value(arg, provider, &hidden, &mut |v| {
            if err.is_some() {
                return;
            }
            match v {
                Value::Error(_) if ignore_errors => {}
                Value::Error(e) => err = Some(e),
                Value::Number(n) => out.push(n),
                _ => {}
            }
        });
    }
    err.map_or(Ok(out), Err)
}

pub(super) fn count_aggregate_non_errors(
    args: &[Expr],
    provider: &dyn EvalProvider,
    hidden_policy: SubtotalHiddenPolicy,
) -> u64 {
    let mut count = 0u64;
    for arg in args {
        let hidden = subtotal_hidden_for_arg(arg, provider, hidden_policy);
        for_each_subtotal_value(arg, provider, &hidden, &mut |v| match v {
            Value::Error(_) | Value::Null => {}
            _ => count += 1,
        });
    }
    count
}
