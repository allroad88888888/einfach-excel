//! `REGEXTEST` / `REGEXEXTRACT` / `REGEXREPLACE` — the REGEX* built-in family.
//!
//! Compiled only when the `regex-formulas` feature is on: the single
//! `mod eval_regex;` declaration in `eval.rs` carries the `#[cfg]`, which is
//! why nothing below repeats it. With the feature off these three names are
//! absent from `eval_func`'s dispatch table and degrade to `#NAME?`.
//!
//! Those three dispatch arms are the only callers, so nothing here is wider
//! than `pub(super)`.
//!
//! `#[path]` on the submodules keeps every file flat in `src/`, matching the
//! rest of the crate — no module here owns a subdirectory.

// 方言口径改写（`\d` 一族拉到 ASCII），在 `cache` 编译前跑一次。
#[path = "eval_regex_ascii.rs"]
mod ascii;
#[path = "eval_regex_cache.rs"]
mod cache;

#[cfg(test)]
#[path = "eval_regex_tests.rs"]
mod tests;

use std::sync::Arc;

use einfach_core::{ArrayData, Value, ValueError};

use crate::formula::Expr;

use super::{coerce_to_number, coerce_to_text, eval_expr_with_provider, EvalProvider};
use cache::compile_regex;

fn read_case_arg(arg: &Expr, provider: &dyn EvalProvider) -> Result<bool, Value> {
    let v = eval_expr_with_provider(arg, provider);
    if let Value::Error(e) = v {
        return Err(Value::Error(e));
    }
    match coerce_to_number(&v) {
        Some(n) => Ok(n.trunc() != 0.0),
        None => Err(Value::Error(ValueError::WrongType)),
    }
}

fn expand_regex_replacement(
    replacement: &str,
    caps: &regex::Captures<'_>,
    full_text: &str,
) -> String {
    let Some(full) = caps.get(0) else {
        return replacement.to_string();
    };
    let mut out = String::new();
    let mut chars = replacement.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '$' {
            out.push(ch);
            continue;
        }
        let Some(marker) = chars.next() else {
            out.push('$');
            break;
        };
        match marker {
            '$' => out.push('$'),
            '&' => out.push_str(full.as_str()),
            '`' => out.push_str(&full_text[..full.start()]),
            '\'' => out.push_str(&full_text[full.end()..]),
            d if d.is_ascii_digit() => {
                let mut token = String::from("$");
                token.push(d);
                let mut digits = String::new();
                digits.push(d);
                if let Some(next) = chars.peek().copied() {
                    if next.is_ascii_digit() {
                        chars.next();
                        token.push(next);
                        digits.push(next);
                    }
                }
                let idx = digits.parse::<usize>().ok();
                if let Some(i) = idx {
                    if i > 0 && i < caps.len() {
                        out.push_str(caps.get(i).map(|m| m.as_str()).unwrap_or(""));
                    } else {
                        out.push_str(&token);
                    }
                } else {
                    out.push_str(&token);
                }
            }
            other => {
                out.push('$');
                out.push(other);
            }
        }
    }
    out
}

pub(super) fn fn_regextest(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    let pat_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = pat_v {
        return Value::Error(e);
    }
    let case_insensitive = if args.len() == 3 {
        match read_case_arg(&args[2], provider) {
            Ok(b) => b,
            Err(v) => return v,
        }
    } else {
        false
    };
    let text = coerce_to_text(&text_v);
    let pattern = coerce_to_text(&pat_v);
    match compile_regex(&pattern, case_insensitive) {
        Ok(re) => Value::Boolean(re.is_match(&text)),
        Err(_) => Value::Error(ValueError::InvalidValue),
    }
}

pub(super) fn fn_regexextract(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    let pat_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = pat_v {
        return Value::Error(e);
    }
    let mode = if args.len() >= 3 {
        let mv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = mv {
            return Value::Error(e);
        }
        match coerce_to_number(&mv) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    let case_insensitive = if args.len() == 4 {
        match read_case_arg(&args[3], provider) {
            Ok(b) => b,
            Err(v) => return v,
        }
    } else {
        false
    };
    let text = coerce_to_text(&text_v);
    let pattern = coerce_to_text(&pat_v);
    let re = match compile_regex(&pattern, case_insensitive) {
        Ok(r) => r,
        Err(_) => return Value::Error(ValueError::InvalidValue),
    };
    match mode {
        // “没匹配上”在 Excel 里是 `#N/A`，不是 `#VALUE!` —— `#VALUE!` 留给
        // “模式本身非法”。TS 引擎一直是 `#N/A`；这里曾经是 `InvalidValue`，
        // 注释写着“没有独立的 N/A 变体”，但 `ValueError::NotAvailable` 早就
        // 存在了，属于陈旧注释带出来的双引擎分歧。
        0 => {
            match re.find(&text) {
                Some(m) => Value::Text(m.as_str().to_string()),
                None => Value::Error(ValueError::NotAvailable),
            }
        }
        1 => {
            let matches: Vec<Value> = re
                .find_iter(&text)
                .map(|m| Value::Text(m.as_str().to_string()))
                .collect();
            if matches.is_empty() {
                return Value::Error(ValueError::NotAvailable);
            }
            let n = matches.len() as u32;
            // 1-column array (one match per row) is how Excel returns this
            // when the pattern has no capture groups in mode 1.
            Value::Array(Arc::new(ArrayData::new(n, 1, matches)))
        }
        2 => {
            let Some(caps) = re.captures(&text) else {
                return Value::Error(ValueError::NotAvailable);
            };
            // 模式里没有捕获组 → 没有可返回的组，同样算“取不到”，`#N/A`。
            if caps.len() <= 1 {
                return Value::Error(ValueError::NotAvailable);
            }
            let data: Vec<Value> = (1..caps.len())
                .map(|i| Value::Text(caps.get(i).map(|m| m.as_str()).unwrap_or("").to_string()))
                .collect();
            Value::Array(Arc::new(ArrayData::new(1, data.len() as u32, data)))
        }
        _ => Value::Error(ValueError::InvalidValue),
    }
}

pub(super) fn fn_regexreplace(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 3 || args.len() > 5 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = text_v {
        return Value::Error(e);
    }
    let pat_v = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = pat_v {
        return Value::Error(e);
    }
    let rep_v = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = rep_v {
        return Value::Error(e);
    }
    let occurrence: i64 = if args.len() >= 4 {
        let ov = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = ov {
            return Value::Error(e);
        }
        match coerce_to_number(&ov) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    let case_insensitive = if args.len() == 5 {
        match read_case_arg(&args[4], provider) {
            Ok(b) => b,
            Err(v) => return v,
        }
    } else {
        false
    };
    let text = coerce_to_text(&text_v);
    let pattern = coerce_to_text(&pat_v);
    let replacement = coerce_to_text(&rep_v);
    let re = match compile_regex(&pattern, case_insensitive) {
        Ok(r) => r,
        Err(_) => return Value::Error(ValueError::InvalidValue),
    };
    if occurrence == 0 {
        Value::Text(
            re.replace_all(&text, |caps: &regex::Captures<'_>| {
                expand_regex_replacement(&replacement, caps, &text)
            })
            .into_owned(),
        )
    } else {
        let matches: Vec<regex::Captures<'_>> = re.captures_iter(&text).collect();
        let idx = if occurrence > 0 {
            occurrence - 1
        } else {
            matches.len() as i64 + occurrence
        };
        if idx < 0 || idx >= matches.len() as i64 {
            // Occurrence not reached → return original text untouched
            // (Excel returns the original string when the nth match
            // doesn't exist; the formula isn't an error).
            return Value::Text(text.clone());
        }
        let caps = &matches[idx as usize];
        let Some(m) = caps.get(0) else {
            return Value::Text(text.clone());
        };
        Value::Text(format!(
            "{}{}{}",
            &text[..m.start()],
            expand_regex_replacement(&replacement, caps, &text),
            &text[m.end()..]
        ))
    }
}
