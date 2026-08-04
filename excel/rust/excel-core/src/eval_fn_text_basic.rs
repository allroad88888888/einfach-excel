//! Dispatches text basic formula functions.

use super::*;

pub(super) fn eval_fn_text_basic(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"CONCATENATE" => {
            let mut out = String::new();
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    if let Value::Error(e) = &v {
                        err = Some(e.clone());
                        return;
                    }
                    out.push_str(&coerce_to_text(&v));
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else {
                Value::Text(out)
            }
        }
        "LEN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            Value::Number(coerce_to_text(&v).chars().count() as f64)
        }
        "LEFT" => text_slice(args, provider, |s, n| s.chars().take(n).collect()),
        "RIGHT" => text_slice(args, provider, |s, n| {
            let len = s.chars().count();
            s.chars().skip(len.saturating_sub(n)).collect()
        }),
        "MID" => {
            // MID(text, start, length) — start is 1-based
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let s = coerce_to_text(&eval_expr_with_provider(&args[0], provider));
            let start_v = eval_expr_with_provider(&args[1], provider);
            let len_v = eval_expr_with_provider(&args[2], provider);
            match (coerce_to_number(&start_v), coerce_to_number(&len_v)) {
                (Some(start), Some(len)) if start >= 1.0 && len >= 0.0 => {
                    let skip = (start as usize).saturating_sub(1);
                    let take = len as usize;
                    Value::Text(s.chars().skip(skip).take(take).collect())
                }
                _ => Value::Error(ValueError::WrongType),
            }
        }
        "UPPER" => text_unary(args, provider, |s| s.to_uppercase()),
        "LOWER" => text_unary(args, provider, |s| s.to_lowercase()),
        "TRIM" => text_unary(args, provider, |s| s.trim().to_string()),
        "TEXT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            let fmt = coerce_to_text(&eval_expr_with_provider(&args[1], provider));
            let n = match coerce_to_number(&n) {
                Some(v) if v.is_finite() => v,
                Some(_) => return Value::Error(ValueError::Overflow),
                None => return Value::Error(ValueError::WrongType),
            };
            match format_with_text_pattern(n, &fmt) {
                Some(formatted) => Value::Text(formatted),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // === Conditional aggregates ===
        //
        // 八个函数的实现都在 `eval_criteria_family.rs`，共同的分档（判据实参
        // 出错 / 条件区错误格 / 值区错误格 / 空格认不认）与形状规则写在那个
        // 文件的模块头，**只有那一份**。候选位置怎么在不物化空格的前提下枚举
        // 出来在 `eval_criteria_blank.rs`。
                _ => unreachable!(),
    }
}
