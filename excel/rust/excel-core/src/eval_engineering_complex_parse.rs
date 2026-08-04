use super::*;

pub(super) fn parse_complex(text: &str) -> Result<(f64, f64, char), ValueError> {
    let s = text.trim();
    if s.is_empty() {
        return Err(ValueError::InvalidValue);
    }
    // Detect and strip suffix.
    let (body, suffix, has_suffix) = match s.chars().last() {
        Some(c) if c == 'i' || c == 'j' => (&s[..s.len() - 1], c, true),
        _ => (s, 'i', false),
    };
    if !has_suffix {
        // Pure real number — must parse cleanly.
        let n: f64 = body.parse().map_err(|_| ValueError::InvalidValue)?;
        return Ok((n, 0.0, 'i'));
    }
    // body now holds the part preceding the suffix. Find a split sign
    // (`+` or `-`) that separates real and imaginary parts, skipping
    // any sign that is part of a scientific-notation exponent (i.e.
    // immediately preceded by `e` or `E`) and any leading sign at
    // position 0 (which is the real part's sign, not a separator).
    let bytes = body.as_bytes();
    let mut split: Option<usize> = None;
    for (i, &b) in bytes.iter().enumerate() {
        if i == 0 {
            continue;
        }
        if b != b'+' && b != b'-' {
            continue;
        }
        let prev = bytes[i - 1];
        if prev == b'e' || prev == b'E' {
            continue;
        }
        split = Some(i);
        // Don't break — we want the LAST eligible split so that any
        // earlier sign that is part of the real part's own scientific
        // exponent is correctly skipped past. Example: `"1e+3+4i"`
        // — the loop visits the `+` at index 2 (skipped, follows `e`)
        // then the `+` at index 4 (kept).
    }
    match split {
        Some(idx) => {
            let real_str = &body[..idx];
            let imag_str = &body[idx..];
            if real_str.is_empty() {
                return Err(ValueError::InvalidValue);
            }
            let real: f64 = real_str.parse().map_err(|_| ValueError::InvalidValue)?;
            // imag_str starts with `+` or `-` and may be just that sign
            // (meaning ±1) or `±<coef>`.
            let imag = if imag_str == "+" || imag_str == "" {
                1.0
            } else if imag_str == "-" {
                -1.0
            } else {
                imag_str.parse().map_err(|_| ValueError::InvalidValue)?
            };
            Ok((real, imag, suffix))
        }
        None => {
            // No split — body is the imaginary coefficient (may be
            // empty for bare `"i"`, or just `"+"` / `"-"` for `"+i"`
            // / `"-i"`).
            let imag = if body.is_empty() || body == "+" {
                1.0
            } else if body == "-" {
                -1.0
            } else {
                body.parse().map_err(|_| ValueError::InvalidValue)?
            };
            Ok((0.0, imag, suffix))
        }
    }
}

pub(super) fn format_complex(real: f64, imag: f64, suffix: char) -> String {
    if imag == 0.0 {
        return format_finite_for_complex(real);
    }
    if real == 0.0 {
        // Pure imaginary: drop coefficient when ±1.
        if imag == 1.0 {
            return format!("{}", suffix);
        }
        if imag == -1.0 {
            return format!("-{}", suffix);
        }
        return format!("{}{}", format_finite_for_complex(imag), suffix);
    }
    // Both parts non-zero. Sign of `imag` lives in the connector.
    if imag > 0.0 {
        let imag_part = if imag == 1.0 {
            String::new()
        } else {
            format_finite_for_complex(imag)
        };
        format!(
            "{}+{}{}",
            format_finite_for_complex(real),
            imag_part,
            suffix
        )
    } else {
        // imag < 0 — emit `-` connector and the absolute value coef.
        let abs_imag = -imag;
        let imag_part = if abs_imag == 1.0 {
            String::new()
        } else {
            format_finite_for_complex(abs_imag)
        };
        format!(
            "{}-{}{}",
            format_finite_for_complex(real),
            imag_part,
            suffix
        )
    }
}

pub(super) fn format_finite_for_complex(n: f64) -> String {
    if n == n.trunc() && n.abs() < 1e16 {
        // Integral value — print as an integer to match Excel's
        // `COMPLEX(3, 4) == "3+4i"` (not "3.0+4.0i").
        format!("{}", n as i64)
    } else {
        // {:e?} would force scientific notation; we want the shortest
        // representation that round-trips. Rust's default Display for
        // f64 already trims trailing zeros and uses scientific notation
        // only for very large/small magnitudes — close enough to {:g}
        // for our parity needs.
        format!("{}", n)
    }
}

pub(super) fn coerce_to_complex(v: &Value) -> Result<(f64, f64, char), ValueError> {
    match v {
        Value::Error(e) => Err(e.clone()),
        Value::Text(s) => parse_complex(s),
        Value::Number(n) => Ok((*n, 0.0, 'i')),
        Value::Boolean(true) => Ok((1.0, 0.0, 'i')),
        Value::Boolean(false) => Ok((0.0, 0.0, 'i')),
        Value::Null => Ok((0.0, 0.0, 'i')),
        // Arrays/Lambdas have no scalar complex interpretation.
        _ => Err(ValueError::WrongType),
    }
}

pub(super) fn eval_complex_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<(f64, f64, char), ValueError> {
    let v = eval_expr_with_provider(arg, provider);
    coerce_to_complex(&v)
}

pub(super) fn complex_unary_text(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(f64, f64, char) -> (f64, f64, char),
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (a, b, s) = match eval_complex_arg(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let (r, i, sfx) = f(a, b, s);
    if !r.is_finite() || !i.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Text(format_complex(r, i, sfx))
}

pub(super) fn complex_unary_number(
    args: &[Expr],
    provider: &dyn EvalProvider,
    f: impl Fn(f64, f64) -> f64,
) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (a, b, _s) = match eval_complex_arg(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    let r = f(a, b);
    if !r.is_finite() {
        return Value::Error(ValueError::Overflow);
    }
    Value::Number(r)
}
