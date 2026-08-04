//! Dispatches text bytes formula functions.

use super::*;

pub(super) fn eval_fn_text_bytes(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"LENB" => fn_lenb(args, provider),
        "LEFTB" => fn_leftb(args, provider),
        "RIGHTB" => fn_rightb(args, provider),
        "MIDB" => fn_midb(args, provider),
        "FINDB" => fn_findb(args, provider),
        "SEARCHB" => fn_searchb(args, provider),
        "REPLACEB" => fn_replaceb(args, provider),
        // === Legacy statistical aliases (Excel pre-2010 names) ===
        //
        // Most route directly to the canonical Excel-365 implementations.
        // A few need wrappers because the legacy form has a different
        // signature (LOGNORMDIST is cumulative-only, NORMSDIST has no
        // cumulative arg, TDIST takes a tails switch instead of cumulative,
        // HYPGEOMDIST / NEGBINOMDIST have no cumulative arg, etc.). The
        // four statistical hypothesis tests (CHISQ.TEST / F.TEST / T.TEST /
        // Z.TEST) and their legacy aliases (CHITEST / FTEST / TTEST /
        // ZTEST) are implemented from scratch — there was no canonical
        // arm yet. LOGNORM.DIST / LOGNORM.INV are also brand-new
        // bodies; the legacy LOGNORMDIST / LOGINV wrap them.
                _ => unreachable!(),
    }
}
