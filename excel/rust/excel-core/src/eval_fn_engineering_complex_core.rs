//! Dispatches engineering complex core formula functions.

use super::*;

pub(super) fn eval_fn_engineering_complex_core(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"COMPLEX" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let real = match coerce_to_number(&eval_expr_with_provider(&args[0], provider)) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let imag = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            let suffix = if args.len() == 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                match v {
                    Value::Text(s) if s == "i" => 'i',
                    Value::Text(s) if s == "j" => 'j',
                    // Excel surfaces #VALUE! for any other suffix.
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                'i'
            };
            if !real.is_finite() || !imag.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(real, imag, suffix))
        }
        "IMABS" => complex_unary_number(args, provider, |a, b| (a * a + b * b).sqrt()),
        "IMAGINARY" => complex_unary_number(args, provider, |_a, b| b),
        "IMREAL" => complex_unary_number(args, provider, |a, _b| a),
        "IMARGUMENT" => {
            // Excel: IMARGUMENT(0) is #DIV/0! (no well-defined
            // argument at the origin). atan2(0, 0) returns 0 in Rust,
            // which would silently mask that case — guard explicitly.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, _s) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            if a == 0.0 && b == 0.0 {
                return Value::Error(ValueError::DivisionByZero);
            }
            Value::Number(b.atan2(a))
        }
        "IMCONJUGATE" => complex_unary_text(args, provider, |a, b, s| (a, -b, s)),
        "IMSUM" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (mut sum_r, mut sum_i, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            for arg in &args[1..] {
                let (r, i, _s) = match eval_complex_arg(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                sum_r += r;
                sum_i += i;
            }
            if !sum_r.is_finite() || !sum_i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(sum_r, sum_i, suffix))
        }
        "IMSUB" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (c, d, _s) = match eval_complex_arg(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let r = a - c;
            let i = b - d;
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, suffix))
        }
        "IMPRODUCT" => {
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (mut pr, mut pi, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            for arg in &args[1..] {
                let (r, i, _s) = match eval_complex_arg(arg, provider) {
                    Ok(t) => t,
                    Err(e) => return Value::Error(e),
                };
                let (nr, ni) = complex_mul(pr, pi, r, i);
                pr = nr;
                pi = ni;
            }
            if !pr.is_finite() || !pi.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(pr, pi, suffix))
        }
        "IMDIV" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let (a, b, suffix) = match eval_complex_arg(&args[0], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (c, d, _s) = match eval_complex_arg(&args[1], provider) {
                Ok(t) => t,
                Err(e) => return Value::Error(e),
            };
            let (r, i) = match complex_div(a, b, c, d) {
                Some(z) => z,
                None => return Value::Error(ValueError::DivisionByZero),
            };
            if !r.is_finite() || !i.is_finite() {
                return Value::Error(ValueError::Overflow);
            }
            Value::Text(format_complex(r, i, suffix))
        }
                _ => unreachable!(),
    }
}
