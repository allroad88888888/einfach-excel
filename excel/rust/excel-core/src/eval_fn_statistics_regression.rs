//! Dispatches statistics regression formula functions.

use super::*;

pub(super) fn eval_fn_statistics_regression(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"LINEST" => fn_linest(args, provider, /*log_y=*/ false),
        "LOGEST" => fn_linest(args, provider, /*log_y=*/ true),
        "TREND" => fn_trend_growth(args, provider, /*log_y=*/ false),
        "GROWTH" => fn_trend_growth(args, provider, /*log_y=*/ true),
        "FORECAST" | "FORECAST.LINEAR" => fn_forecast(args, provider),
        "STEYX" => fn_steyx(args, provider),
        "RSQ" => fn_rsq(args, provider),
        // PEARSON is identical to CORREL — route through the same impl.
        "PEARSON" => correl_impl(args, provider),
                _ => unreachable!(),
    }
}
