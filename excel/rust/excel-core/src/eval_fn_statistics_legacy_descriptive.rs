//! Dispatches statistics legacy descriptive formula functions.

use super::*;

pub(super) fn eval_fn_statistics_legacy_descriptive(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"RAND" => stat_rand(args),
        // RANDBETWEEN(low, high) — uniform integer in [low, high] inclusive.
        // low > high → #NUM!. Both args truncate toward zero before validation.
        "RANDBETWEEN" => stat_randbetween(args, provider),

        // PERCENTRANK / PERCENTRANK.INC(array, x[, significance=3]) —
        // inclusive rank-in-array as decimal fraction. Truncated to
        // `significance` digits.
        "PERCENTRANK" | "PERCENTRANK.INC" => stat_percentrank_inc(args, provider),
        // PERCENTRANK.EXC(array, x[, significance=3]) — exclusive variant
        // using rank/(N+1).
        "PERCENTRANK.EXC" => stat_percentrank_exc(args, provider),

        // MODE.SNGL — Excel 2010+ rename of MODE. Routes through the same
        // arm (returns the most-frequent number; ties broken by smallest).
        "MODE.SNGL" => eval_func("MODE", args, provider),
        // MODE.MULT — array form returning every value tied for the mode.
        // Returns a column array (n×1). SPILL.
        "MODE.MULT" => stat_mode_mult(args, provider),

        // MAXA / MINA — like MAX / MIN but TEXT contributes 0, TRUE 1,
        // FALSE 0 (logicals are NOT skipped). Empty cells are still skipped.
        "MAXA" => stat_max_min_a(args, provider, /*want_max=*/ true),
        "MINA" => stat_max_min_a(args, provider, /*want_max=*/ false),

        // STDEVA / STDEVPA / VARA / VARPA — A-variants of the sample/pop
        // standard-deviation and variance. Text counts as 0, TRUE/FALSE as
        // 1/0; empty cells are skipped.
        "STDEVA" => stat_var_a(args, provider, /*sample=*/ true, /*sqrt=*/ true),
        "STDEVPA" => stat_var_a(args, provider, /*sample=*/ false, /*sqrt=*/ true),
        "VARA" => stat_var_a(args, provider, /*sample=*/ true, /*sqrt=*/ false),
        "VARPA" => stat_var_a(args, provider, /*sample=*/ false, /*sqrt=*/ false),

        // SKEW.P — population skewness. The existing `SKEW` is the sample
        // form; `SKEW.P` divides moment-3 by n (not the bias-correction
        // factor) and uses the population standard deviation.
        "SKEW.P" => stat_skew_p(args, provider),

        // FREQUENCY(data_array, bins_array) — distribution count.
        // Returns an array of length `bins.len() + 1`, one bucket per bin
        // plus a final "greater than the largest bin" bucket. SPILL.
        "FREQUENCY" => stat_frequency(args, provider),

        // PROB(x_range, prob_range, lower[, upper]) — sum of probabilities
        // for x values in [lower, upper]. Validates prob_range sums to ≈ 1
        // and every prob ∈ (0, 1].
        "PROB" => stat_prob(args, provider),

        // GAUSS(x) — NORM.S.DIST(x, TRUE) - 0.5 (probability between 0 and x
        // in the standard normal distribution).
        "GAUSS" => stat_gauss(args, provider),
        // PHI(x) — standard normal probability density.
        "PHI" => stat_phi(args, provider),

        // S batch arms: math/aggregation/formatting/complex/dynamic-array.
                _ => unreachable!(),
    }
}
