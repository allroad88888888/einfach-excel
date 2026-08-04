//! Dispatches criteria formula functions.

use super::*;

pub(super) fn eval_fn_criteria(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"COUNTIF" => eval_criteria_family::fn_countif(args, provider),
        "SUMIF" => eval_criteria_family::fn_sumif(args, provider),
        "AVERAGEIF" => eval_criteria_family::fn_averageif(args, provider),
        "COUNTIFS" => eval_criteria_family::fn_countifs(args, provider),
        "SUMIFS" => eval_criteria_family::fn_sumifs(args, provider),
        "AVERAGEIFS" => eval_criteria_family::fn_averageifs(args, provider),
        "MAXIFS" => eval_criteria_family::fn_maxifs(args, provider),
        "MINIFS" => eval_criteria_family::fn_minifs(args, provider),

        // === Phase 5: lookup / stats / dates ===
                _ => unreachable!(),
    }
}
