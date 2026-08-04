//! Dispatches text regex formula functions.

use super::*;

pub(super) fn eval_fn_text_regex(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {        #[cfg(feature = "regex-formulas")]
        "REGEXTEST" => eval_regex::fn_regextest(args, provider),
        #[cfg(feature = "regex-formulas")]
        "REGEXEXTRACT" => eval_regex::fn_regexextract(args, provider),
        #[cfg(feature = "regex-formulas")]
        "REGEXREPLACE" => eval_regex::fn_regexreplace(args, provider),
                _ => unreachable!(),
    }
}
