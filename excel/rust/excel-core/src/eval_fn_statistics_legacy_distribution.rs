//! Dispatches statistics legacy distribution formula functions.

use super::*;

pub(super) fn eval_fn_statistics_legacy_distribution(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"BETADIST" => stat_legacy_betadist(args, provider),
        "BETAINV" => stat_beta_inv(args, provider),
        "BINOMDIST" => stat_binom_dist(args, provider),
        "CHIDIST" => stat_chisq_dist_rt(args, provider),
        "CHIINV" => stat_chisq_inv_rt(args, provider),
        "CHISQ.TEST" | "CHITEST" => stat_chisq_test(args, provider),
        "CONFIDENCE" | "CONFIDENCE.NORM" => stat_confidence_norm(args, provider),
        "COVARIANCE.P" => covar_impl(args, provider, false),
        "COVARIANCE.S" => covar_impl(args, provider, true),
        "CRITBINOM" => stat_binom_inv(args, provider),
        "EXPONDIST" => stat_expon_dist(args, provider),
        "FDIST" => stat_f_dist_rt(args, provider),
        "FINV" => stat_f_inv_rt(args, provider),
        "F.TEST" | "FTEST" => stat_f_test(args, provider),
        "GAMMADIST" => stat_gamma_dist(args, provider),
        "GAMMAINV" => stat_gamma_inv(args, provider),
        "HYPGEOMDIST" => stat_legacy_hypgeomdist(args, provider),
        "LOGNORM.DIST" => stat_lognorm_dist(args, provider),
        "LOGNORM.INV" | "LOGINV" => stat_lognorm_inv(args, provider),
        "LOGNORMDIST" => stat_legacy_lognormdist(args, provider),
        "NEGBINOMDIST" => stat_legacy_negbinomdist(args, provider),
        "NORMDIST" => stat_norm_dist(args, provider),
        "NORMINV" => stat_norm_inv(args, provider),
        "NORMSDIST" => stat_legacy_normsdist(args, provider),
        "NORMSINV" => stat_norm_s_inv(args, provider),
        "POISSON" => stat_poisson_dist(args, provider),
        "TDIST" => stat_legacy_tdist(args, provider),
        "TINV" => stat_t_inv_2t(args, provider),
        "T.TEST" | "TTEST" => stat_t_test(args, provider),
        "WEIBULL" => stat_weibull_dist(args, provider),
        "Z.TEST" | "ZTEST" => stat_z_test(args, provider),
        // Regression + matrix algebra (P batch).
        //
        // LINEST / LOGEST / TREND / GROWTH all share the same least-squares
        // core (`linreg_core`): solve `(X^T X) β = X^T y` via Gauss-Jordan
        // on the augmented normal-equation matrix. LOGEST/GROWTH log-
        // transform `y` first (and `exp` at the end). Multi-x is supported
        // by feeding multiple columns of `known_x`. FORECAST is a scalar
        // shortcut that uses single-variable LINEST internally.
        //
        // MMULT / MINVERSE / MUNIT / TRANSPOSE are array-producing matrix
        // helpers. MINVERSE uses Gauss-Jordan with partial pivoting
        // (pivot magnitude < 1e-12 → #NUM!). MMULT rejects mismatched
        // inner dimensions with #VALUE! and propagates errors.
        "STDEVP" => eval_func("STDEV.P", args, provider),
        "VARP" => eval_func("VAR.P", args, provider),

        // CONFIDENCE.T(alpha, stdev, size) — Student-t confidence
        // interval half-width: `T.INV.2T(alpha, size - 1) * stdev / sqrt(size)`.
        "CONFIDENCE.T" => stat_confidence_t(args, provider),

        // BINOM.DIST.RANGE(trials, prob, lower[, upper]) — sum of
        // binomial PMF over `k ∈ [lower, upper]`. Single-arg form
        // (no upper) returns just PMF(lower).
        "BINOM.DIST.RANGE" => stat_binom_dist_range(args, provider),

        // PERMUT(n, k) — number of permutations: `n! / (n-k)!`.
        // PERMUTATIONA(n, k) — permutations with repetition: `n^k`.
        "PERMUT" => stat_permut(args, provider),
        "PERMUTATIONA" => stat_permutationa(args, provider),

        // DAYS360(start, end[, method=FALSE]) — 30/360 day count.
        // method=FALSE → US (NASD) form (basis 0); method=TRUE →
        // European form (basis 4). Always returns an integer.
                _ => unreachable!(),
    }
}
