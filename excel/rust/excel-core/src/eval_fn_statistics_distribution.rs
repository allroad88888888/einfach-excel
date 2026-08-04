//! Dispatches statistics distribution formula functions.

use super::*;

pub(super) fn eval_fn_statistics_distribution(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"NORM.DIST" => stat_norm_dist(args, provider),
        "NORM.INV" => stat_norm_inv(args, provider),
        "NORM.S.DIST" => stat_norm_s_dist(args, provider),
        "NORM.S.INV" => stat_norm_s_inv(args, provider),
        "T.DIST" => stat_t_dist(args, provider),
        "T.DIST.RT" => stat_t_dist_rt(args, provider),
        "T.DIST.2T" => stat_t_dist_2t(args, provider),
        "T.INV" => stat_t_inv(args, provider),
        "T.INV.2T" => stat_t_inv_2t(args, provider),
        "F.DIST" => stat_f_dist(args, provider),
        "F.DIST.RT" => stat_f_dist_rt(args, provider),
        "F.INV" => stat_f_inv(args, provider),
        "F.INV.RT" => stat_f_inv_rt(args, provider),
        "CHISQ.DIST" => stat_chisq_dist(args, provider),
        "CHISQ.DIST.RT" => stat_chisq_dist_rt(args, provider),
        "CHISQ.INV" => stat_chisq_inv(args, provider),
        "CHISQ.INV.RT" => stat_chisq_inv_rt(args, provider),
        "EXPON.DIST" => stat_expon_dist(args, provider),
        "WEIBULL.DIST" => stat_weibull_dist(args, provider),
        "BETA.DIST" => stat_beta_dist(args, provider),
        "BETA.INV" => stat_beta_inv(args, provider),
        "GAMMA.DIST" => stat_gamma_dist(args, provider),
        "GAMMA.INV" => stat_gamma_inv(args, provider),
        "BINOM.DIST" => stat_binom_dist(args, provider),
        "BINOM.INV" => stat_binom_inv(args, provider),
        "POISSON.DIST" => stat_poisson_dist(args, provider),
        "HYPGEOM.DIST" => stat_hypgeom_dist(args, provider),
        "NEGBINOM.DIST" => stat_negbinom_dist(args, provider),
        "GAMMA" => stat_gamma_func(args, provider),
        "GAMMALN" => stat_gammaln(args, provider),
        "ERF" => stat_erf(args, provider),
        "ERFC" => stat_erfc(args, provider),
        "KURT" => stat_kurt(args, provider),
        "SKEW" => stat_skew(args, provider),
        "AVEDEV" => stat_avedev(args, provider),
        "DEVSQ" => stat_devsq(args, provider),
        "GEOMEAN" => stat_geomean(args, provider),
        "HARMEAN" => stat_harmean(args, provider),
        "TRIMMEAN" => stat_trimmean(args, provider),
        "STANDARDIZE" => stat_standardize(args, provider),
        "FISHER" => stat_fisher(args, provider),
        "FISHERINV" => stat_fisherinv(args, provider),
        // Fallthrough: not a built-in. Before surfacing #NAME?, consult the
        // workbook's defined-name registry — a stored `Value::Lambda` makes
        // `=SQUARE(5)` work after `define_name("SQUARE", "=LAMBDA(x, x*x)")`.
        // Non-lambda named values aren't callable as a function (Excel parity:
        // `=answer()` when `answer` is 42 is a #VALUE!, not 42).
        "ERF.PRECISE" => eval_func("ERF", args, provider),
        "ERFC.PRECISE" => eval_func("ERFC", args, provider),
        "GAMMALN.PRECISE" => eval_func("GAMMALN", args, provider),

        // CONCAT(text1, text2, …) — Excel-365 alias of CONCATENATE
        // that accepts ranges/arrays. Our CONCATENATE already
        // flattens ranges via `for_each_arg_value`, so they share an
        // implementation.
                _ => unreachable!(),
    }
}
