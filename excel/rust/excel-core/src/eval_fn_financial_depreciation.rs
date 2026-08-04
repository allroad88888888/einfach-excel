//! Dispatches financial depreciation formula functions.

use super::*;

pub(super) fn eval_fn_financial_depreciation(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SLN" => fn_sln(args, provider),
        "SYD" => fn_syd(args, provider),
        "DB" => fn_db(args, provider),
        "DDB" => fn_ddb(args, provider),
        "VDB" => fn_vdb(args, provider),
        "CUMIPMT" => fn_cumipmt(args, provider),
        "CUMPRINC" => fn_cumprinc(args, provider),
        "EFFECT" => fn_effect(args, provider),
        "NOMINAL" => fn_nominal(args, provider),
        "ISPMT" => fn_ispmt(args, provider),
                _ => unreachable!(),
    }
}
