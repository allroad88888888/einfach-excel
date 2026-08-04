//! Dispatches math advanced formula functions.

use super::*;

pub(super) fn eval_fn_math_advanced(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"SUMX2MY2" => sum_pair_impl(args, provider, |x, y| x * x - y * y),
        "SUMX2PY2" => sum_pair_impl(args, provider, |x, y| x * x + y * y),
        "SUMXMY2" => sum_pair_impl(args, provider, |x, y| (x - y) * (x - y)),

        // SUMSQ — variadic `Σ x²`. Walks each arg via `for_each_arg_value`
        // so a `SUMSQ(A:A)` stays sparse. Only numeric values contribute;
        // booleans and text are skipped, errors propagate.
        "SUMSQ" => {
            let mut total = 0.0_f64;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Number(n) => total += n * n,
                        _ => {}
                    }
                });
            }
            match err {
                Some(e) => Value::Error(e),
                None => Value::Number(total),
            }
        }

        // SQRTPI(n) — `sqrt(n * PI)`. Excel returns #NUM! for negatives.
        "SQRTPI" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) if n < 0.0 => Value::Error(ValueError::Overflow),
                Some(n) => Value::Number((n * std::f64::consts::PI).sqrt()),
                None => Value::Error(ValueError::WrongType),
            }
        }

        // SUMPRODUCT(array1[, array2, ...]) — multiply element-wise across N
        // arrays of identical shape, then sum. N == 1 collapses to "SUM over
        // numerics" of the single array. Shape mismatch → #VALUE!.
        // Non-numeric cells contribute 0 (Excel parity).
        "SUMPRODUCT" => sumproduct_impl(args, provider),

        // FLOOR.MATH / CEILING.MATH — precise rounding family. 1-3 args.
        // `significance` defaults to 1; `mode` defaults to 0 ("toward
        // -inf" for FLOOR.MATH, "toward +inf" for CEILING.MATH). When
        // mode != 0, negatives round toward zero (FLOOR.MATH) / away
        // from zero (CEILING.MATH) instead. These diverge from
        // FLOOR.PRECISE / CEILING.PRECISE specifically on negatives.
        "FLOOR.MATH" => floor_ceiling_math(args, provider, true),
        "CEILING.MATH" => floor_ceiling_math(args, provider, false),

        // FLOOR.PRECISE / CEILING.PRECISE — always round toward -inf /
        // +inf regardless of sign. 1 or 2 args; `significance` defaults
        // to 1. Negative significance is accepted but treated as `|sig|`
        // per Excel parity.
        "FLOOR.PRECISE" => floor_ceiling_precise(args, provider, true),
        "CEILING.PRECISE" => floor_ceiling_precise(args, provider, false),

        // ROMAN / ARABIC — round-trip between integers and Roman numerals.
        // ROMAN supports Excel's classic and simplified forms 0..4.
        "ROMAN" => fn_roman(args, provider),
        "ARABIC" => fn_arabic(args, provider),

        // DECIMAL / BASE — round-trip between text in base N (2..=36)
        // and integers. Letters A..Z are 10..35, case-insensitive.
        "DECIMAL" => fn_decimal(args, provider),
        "BASE" => fn_base(args, provider),

        // MDETERM(range) — determinant of a SQUARE matrix range.
        // Implemented via Doolittle LU decomposition with partial
        // pivoting; numerically stable up to ~50×50, tested through
        // 10×10. Non-square → #VALUE!. Non-numeric cell → #TYPE!.
        //
        // note: MMULT/MINVERSE deferred until Value::Array lands — they
        // require a matrix output type, which the current single-Value
        // eval pipeline cannot express.
        "ODD" => fn_odd(args, provider),
        "EVEN" => fn_even(args, provider),
        "FACTDOUBLE" => fn_factdouble(args, provider),
        "COMBINA" => fn_combina(args, provider),
        "MULTINOMIAL" => fn_multinomial(args, provider),
        "SERIESSUM" => fn_seriessum(args, provider),
        "ISO.CEILING" => floor_ceiling_precise(args, provider, false),
                _ => unreachable!(),
    }
}
