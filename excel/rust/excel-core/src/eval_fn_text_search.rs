//! Dispatches text search formula functions.

use super::*;

pub(super) fn eval_fn_text_search(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"FIND" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let find_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = find_v {
                return Value::Error(e);
            }
            let within_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = within_v {
                return Value::Error(e);
            }
            let start_num = if args.len() == 3 {
                let s = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = s {
                    return Value::Error(e);
                }
                match coerce_to_number(&s) {
                    Some(n) if n >= 1.0 => n as usize,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            let find_text = coerce_to_text(&find_v);
            let within_text = coerce_to_text(&within_v);
            // Empty needle: Excel returns start_num itself.
            if find_text.is_empty() {
                if start_num > within_text.chars().count() + 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                return Value::Number(start_num as f64);
            }
            let needle_chars: Vec<char> = find_text.chars().collect();
            let haystack_chars: Vec<char> = within_text.chars().collect();
            if start_num > haystack_chars.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            let start_idx = start_num - 1;
            // Walk char-by-char starting at start_idx.
            let mut i = start_idx;
            while i + needle_chars.len() <= haystack_chars.len() {
                if haystack_chars[i..i + needle_chars.len()] == needle_chars[..] {
                    return Value::Number((i + 1) as f64);
                }
                i += 1;
            }
            Value::Error(ValueError::InvalidValue)
        }

        // SEARCH(find_text, within_text[, start_num]) — case-insensitive, 1-based.
        // no wildcard support yet
        "SEARCH" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let find_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = find_v {
                return Value::Error(e);
            }
            let within_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = within_v {
                return Value::Error(e);
            }
            let start_num = if args.len() == 3 {
                let s = eval_expr_with_provider(&args[2], provider);
                if let Value::Error(e) = s {
                    return Value::Error(e);
                }
                match coerce_to_number(&s) {
                    Some(n) if n >= 1.0 => n as usize,
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                1
            };
            let find_text = coerce_to_text(&find_v).to_lowercase();
            let within_text = coerce_to_text(&within_v).to_lowercase();
            if find_text.is_empty() {
                if start_num > within_text.chars().count() + 1 {
                    return Value::Error(ValueError::InvalidValue);
                }
                return Value::Number(start_num as f64);
            }
            let needle_chars: Vec<char> = find_text.chars().collect();
            let haystack_chars: Vec<char> = within_text.chars().collect();
            if start_num > haystack_chars.len() {
                return Value::Error(ValueError::InvalidValue);
            }
            let start_idx = start_num - 1;
            let mut i = start_idx;
            while i + needle_chars.len() <= haystack_chars.len() {
                if haystack_chars[i..i + needle_chars.len()] == needle_chars[..] {
                    return Value::Number((i + 1) as f64);
                }
                i += 1;
            }
            Value::Error(ValueError::InvalidValue)
        }

        // SUBSTITUTE(text, old, new[, instance_num]).
        // Char-based to avoid byte-offset bugs on multi-byte strings.
        "SUBSTITUTE" => {
            if args.len() < 3 || args.len() > 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let old_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = old_v {
                return Value::Error(e);
            }
            let new_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = new_v {
                return Value::Error(e);
            }
            let instance: Option<usize> = if args.len() == 4 {
                let i = eval_expr_with_provider(&args[3], provider);
                if let Value::Error(e) = i {
                    return Value::Error(e);
                }
                match coerce_to_number(&i) {
                    Some(n) if n >= 1.0 => Some(n as usize),
                    _ => return Value::Error(ValueError::InvalidValue),
                }
            } else {
                None
            };
            let text = coerce_to_text(&text_v);
            let old = coerce_to_text(&old_v);
            let new_s = coerce_to_text(&new_v);
            if old.is_empty() {
                return Value::Text(text);
            }
            let text_chars: Vec<char> = text.chars().collect();
            let old_chars: Vec<char> = old.chars().collect();
            let mut out = String::new();
            let mut i = 0;
            let mut hit = 0usize;
            while i < text_chars.len() {
                if i + old_chars.len() <= text_chars.len()
                    && text_chars[i..i + old_chars.len()] == old_chars[..]
                {
                    hit += 1;
                    let replace_here = match instance {
                        Some(n) => hit == n,
                        None => true,
                    };
                    if replace_here {
                        out.push_str(&new_s);
                    } else {
                        for c in &old_chars {
                            out.push(*c);
                        }
                    }
                    i += old_chars.len();
                } else {
                    out.push(text_chars[i]);
                    i += 1;
                }
            }
            Value::Text(out)
        }

        // REPLACE(text, start_num, num_chars, new_text). 1-based char position.
        "REPLACE" => {
            if args.len() != 4 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let start_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = start_v {
                return Value::Error(e);
            }
            let num_v = eval_expr_with_provider(&args[2], provider);
            if let Value::Error(e) = num_v {
                return Value::Error(e);
            }
            let new_v = eval_expr_with_provider(&args[3], provider);
            if let Value::Error(e) = new_v {
                return Value::Error(e);
            }
            let start = match coerce_to_number(&start_v) {
                Some(n) if n >= 1.0 => n as usize,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let num = match coerce_to_number(&num_v) {
                Some(n) if n >= 0.0 => n as usize,
                _ => return Value::Error(ValueError::InvalidValue),
            };
            let text = coerce_to_text(&text_v);
            let new_s = coerce_to_text(&new_v);
            let text_chars: Vec<char> = text.chars().collect();
            let len = text_chars.len();
            let start_idx = start - 1; // 1-based -> 0-based
                                       // start past end → append.
            let prefix_end = start_idx.min(len);
            let cut_end = (start_idx + num).min(len);
            let mut out = String::new();
            for c in &text_chars[..prefix_end] {
                out.push(*c);
            }
            out.push_str(&new_s);
            for c in &text_chars[cut_end..] {
                out.push(*c);
            }
            Value::Text(out)
        }

        // REPT(text, n) — char-count limit 32767 per Excel.
                _ => unreachable!(),
    }
}
