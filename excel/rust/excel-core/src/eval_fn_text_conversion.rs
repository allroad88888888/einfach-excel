//! Dispatches text conversion formula functions.

use super::*;

pub(super) fn eval_fn_text_conversion(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"UNICHAR" => fn_unichar(args, provider),
        "UNICODE" => fn_unicode(args, provider),
        "NUMBERVALUE" => fn_numbervalue(args, provider),
        "ARRAYTOTEXT" => fn_arraytotext(args, provider),
        "VALUETOTEXT" => fn_valuetotext(args, provider),
        // Gated on `regex-formulas`. With the feature off these three names
        // are absent from the dispatch table, so they take the `_` arm into
        // `eval_named_call` and end at `#NAME?` — no special-casing needed.
        _ => unreachable!(),
    }
}
