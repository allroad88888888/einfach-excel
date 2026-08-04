//! Dispatches linked content formula functions.

use super::*;

pub(super) fn eval_fn_linked_content(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"HYPERLINK" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let link_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = link_v {
                return Value::Error(e);
            }
            let link_text = coerce_to_text(&link_v);
            if args.len() == 2 {
                let friendly_v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = friendly_v {
                    return Value::Error(e);
                }
                Value::Text(coerce_to_text(&friendly_v))
            } else {
                Value::Text(link_text)
            }
        }
        // IMAGE(source, [alt_text], [sizing=0], [height], [width]) — 1..=5 args.
        //
        //   source  : URL or local file path. Coerced to text. Empty → #VALUE!.
        //   alt_text: optional accessibility text. Coerced to text if present.
        //   sizing  : 0 = original size (default), 1 = stretch to fit cell,
        //             2 = fit within cell preserving aspect, 3 = custom h+w
        //             (uses args 4 and 5). Anything else → #VALUE!.
        //   height  : only valid when sizing == 3, must be > 0.
        //   width   : only valid when sizing == 3, must be > 0.
        //
        // Excel surfaces a special "image value" cell type that isn't text.
        // We don't model that variant — instead the formula evaluates to a
        // structured `Value::Text` payload the host UI can detect by prefix:
        //
        //   `<IMAGE: {source}>`                                 (basic case)
        //   `<IMAGE: {source} alt="{alt}">`                     (with alt text)
        //   `<IMAGE: {source} alt="{alt}" sizing={n}>`          (non-default sizing)
        //   `<IMAGE: {source} alt="..." sizing=3 height={h} width={w}>` (custom)
        //
        // This is HOST INTEGRATION: the JS side spots the `<IMAGE: ` prefix
        // and renders an actual `<img>` element instead of the literal text.
        // We picked the structured-text route (vs returning the raw URL and
        // making the host walk the formula AST) so the same detection logic
        // works for cells that copy/paste the formula result as a value.
        "IMAGE" => {
            if args.is_empty() || args.len() > 5 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let source_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = source_v {
                return Value::Error(e);
            }
            let source = coerce_to_text(&source_v);
            if source.is_empty() {
                return Value::Error(ValueError::InvalidValue);
            }
            let alt = if args.len() >= 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                // Null (omitted-ish) → no alt text; otherwise coerce.
                if matches!(v, Value::Null) {
                    None
                } else {
                    Some(coerce_to_text(&v))
                }
            } else {
                None
            };
            let sizing = if args.len() >= 3 {
                let v = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                if matches!(v, Value::Null) {
                    0
                } else {
                    match coerce_to_number(&v) {
                        Some(n) if (n - n.trunc()).abs() < 1e-9 => {
                            let i = n.trunc() as i64;
                            if !(0..=3).contains(&i) {
                                return Value::Error(ValueError::InvalidValue);
                            }
                            i as u8
                        }
                        _ => return Value::Error(ValueError::InvalidValue),
                    }
                }
            } else {
                0
            };
            let (height, width) = if sizing == 3 {
                if args.len() != 5 {
                    return Value::Error(ValueError::InvalidValue);
                }
                let hv = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = hv {
                    return Value::Error(e);
                }
                let wv = eval_expr_with_provider(&args[4], provider);
                if let Value::Error(e) = wv {
                    return Value::Error(e);
                }
                let h = match coerce_to_number(&hv) {
                    Some(n) if n > 0.0 && n.is_finite() => n,
                    _ => return Value::Error(ValueError::InvalidValue),
                };
                let w = match coerce_to_number(&wv) {
                    Some(n) if n > 0.0 && n.is_finite() => n,
                    _ => return Value::Error(ValueError::InvalidValue),
                };
                (Some(h), Some(w))
            } else {
                // For sizing 0/1/2, height/width must NOT be supplied (Excel
                // ignores them silently, but we surface #VALUE! to keep the
                // contract explicit). If they happen to be present we still
                // accept Null-y omissions: only flag when args 4/5 are real.
                if args.len() >= 4 {
                    let hv = eval_expr_with_provider(&args[3], provider);
                    if let Value::Error(e) = hv {
                        return Value::Error(e);
                    }
                    if !matches!(hv, Value::Null) {
                        return Value::Error(ValueError::InvalidValue);
                    }
                }
                if args.len() == 5 {
                    let wv = eval_expr_with_provider(&args[4], provider);
                    if let Value::Error(e) = wv {
                        return Value::Error(e);
                    }
                    if !matches!(wv, Value::Null) {
                        return Value::Error(ValueError::InvalidValue);
                    }
                }
                (None, None)
            };
            Value::Text(format_image_payload(
                &source,
                alt.as_deref(),
                sizing,
                height,
                width,
            ))
        }
        // === Bessel family ===
        // BESSELJ / BESSELY / BESSELI / BESSELK all follow the same shape:
        // two numeric args (x, n), n must be a non-negative integer (Excel
        // truncates n toward zero before validating). The actual math lives
        // in `bessel_j_n` / `bessel_y_n` / `bessel_i_n` / `bessel_k_n` below.
                _ => unreachable!(),
    }
}
