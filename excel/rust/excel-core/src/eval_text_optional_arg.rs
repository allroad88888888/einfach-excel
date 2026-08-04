use super::*;

pub(super) fn eval_optional_value_arg(
    arg: Option<&Expr>,
    provider: &dyn EvalProvider,
    default: Value,
) -> Value {
    match arg {
        Some(expr) => eval_expr_with_provider(expr, provider),
        None => default,
    }
}
