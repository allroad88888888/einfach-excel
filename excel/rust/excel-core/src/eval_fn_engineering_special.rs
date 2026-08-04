//! Dispatches engineering special formula functions.

use super::*;

pub(super) fn eval_fn_engineering_special(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"BESSELJ" => eval_bessel(args, provider, bessel_j_n),
        "BESSELY" => eval_bessel(args, provider, bessel_y_n),
        "BESSELI" => eval_bessel(args, provider, bessel_i_n),
        "BESSELK" => eval_bessel(args, provider, bessel_k_n),

        // CONVERT(number, from_unit, to_unit) — unit conversion. Looks up
        // each unit in the static table built by `convert_unit_factor`;
        // mismatched categories surface `#N/A` (we use `InvalidValue` per
        // the project's error mapping). Temperature is special-cased
        // because its conversions are affine, not linear.
        "CONVERT" => eval_convert(args, provider),

        // === R batch: odd-coupon bond pricing + coupon-date utilities + misc finance ===
        // Yield solvers (ODDFYIELD) use Newton-Raphson seeded at the coupon
        // rate (same approach as YIELD). ODDLYIELD has a closed-form
        // solution and so does not iterate.
                _ => unreachable!(),
    }
}
