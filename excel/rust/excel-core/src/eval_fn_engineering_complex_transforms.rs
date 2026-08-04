//! Dispatches engineering complex transforms formula functions.

use super::*;

pub(super) fn eval_fn_engineering_complex_transforms(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"IMEXP" => complex_unary_text(args, provider, |a, b, s| {
            let mag = a.exp();
            (mag * b.cos(), mag * b.sin(), s)
        }),
        "IMLN" => {
            // ln(z) = ln|z| + i*arg(z). Domain: z != 0.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let r = (a * a + b * b).sqrt().ln();
            let i = b.atan2(a);
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMLOG10" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let denom = 10.0_f64.ln();
            let r = (a * a + b * b).sqrt().ln() / denom;
            let i = b.atan2(a) / denom;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMLOG2" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::Overflow);
            }
            let denom = 2.0_f64.ln();
            let r = (a * a + b * b).sqrt().ln() / denom;
            let i = b.atan2(a) / denom;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMSQRT" => complex_unary_text(args, provider, |a, b, s| {
            // sqrt(z) = sqrt(r) * (cos(arg/2) + sin(arg/2)i), principal value.
            let r = (a * a + b * b).sqrt();
            let arg_half = b.atan2(a) / 2.0;
            let mag = r.sqrt();
            (mag * arg_half.cos(), mag * arg_half.sin(), s)
        }),
        "IMPOWER" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let n = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(x) => x,
                None => return Value::Error(ValueError::WrongType),
            };
            // De Moivre. Origin handling: 0^0 mirrors POWER (Excel
            // returns 1), 0^positive == 0, 0^negative is #NUM!.
            if a == 0.0 && b == 0.0 {
                if n == 0.0 {
                    return Value::Text(format_complex(1.0, 0.0, s));
                }
                if n < 0.0 {
                    return Value::Error(ValueError::Overflow);
                }
                return Value::Text(format_complex(0.0, 0.0, s));
            }
            let r = (a * a + b * b).sqrt();
            let arg = b.atan2(a);
            let mag = r.powf(n);
            let theta = arg * n;
            let real = mag * theta.cos();
            let imag = mag * theta.sin();
            if !real.is_finite() || !imag.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(real, imag, s))
        }
        "IMCOS" => complex_unary_text(args, provider, |a, b, s| {
            (a.cos() * b.cosh(), -a.sin() * b.sinh(), s)
        }),
        "IMCOSH" => complex_unary_text(args, provider, |a, b, s| {
            (a.cosh() * b.cos(), a.sinh() * b.sin(), s)
        }),
        "IMSIN" => complex_unary_text(args, provider, |a, b, s| {
            (a.sin() * b.cosh(), a.cos() * b.sinh(), s)
        }),
        "IMSINH" => complex_unary_text(args, provider, |a, b, s| {
            (a.sinh() * b.cos(), a.cosh() * b.sin(), s)
        }),
        "IMTAN" => {
            // tan = sin/cos. Singularities at z = (k + 1/2)π for real
            // z; cos hits zero exactly there. Surface #NUM! per Excel
            // when the denominator is zero (we use Overflow which maps
            // to #NUM!).
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (r, i) = match complex_div(sin_r, sin_i, cos_r, cos_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMSEC" => {
            // sec = 1/cos.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (r, i) = match complex_div(1.0, 0.0, cos_r, cos_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCSC" => {
            // csc = 1/sin.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (r, i) = match complex_div(1.0, 0.0, sin_r, sin_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCOT" => {
            // cot = cos/sin.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cos_r, cos_i) = (a.cos() * b.cosh(), -a.sin() * b.sinh());
            let (sin_r, sin_i) = (a.sin() * b.cosh(), a.cos() * b.sinh());
            let (r, i) = match complex_div(cos_r, cos_i, sin_r, sin_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        // AREAS(reference) — count the number of disjoint areas in a
        // reference. Excel parity:
        //   • A bare cell ref or range counts as 1 area.
        //   • A multi-area `(A1:B2, D5:E6)` counts each part separately.
        //   • Cross-sheet refs / ranges count as 1.
        //   • Anything else (literals, arithmetic, function calls that
        //     return scalars) → #VALUE!.
        //
        // The argument is inspected as an AST (not evaluated) because the
        // multi-area syntax doesn't produce a scalar value — see
        // `Expr::MultiArea`'s eval arm. `=AREAS(1+2)` is a parse-tree
        // BinOp, not a ref, so it surfaces #VALUE! per Excel.
        "IMSECH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (cosh_r, cosh_i) = (a.cosh() * b.cos(), a.sinh() * b.sin());
            let (r, i) = match complex_div(1.0, 0.0, cosh_r, cosh_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
        "IMCSCH" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (sinh_r, sinh_i) = (a.sinh() * b.cos(), a.cosh() * b.sin());
            let (r, i) = match complex_div(1.0, 0.0, sinh_r, sinh_i) {
                Some(z) => z,
                None => return Value::Error(ValueError::Overflow),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, s))
        }
                _ => unreachable!(),
    }
}
