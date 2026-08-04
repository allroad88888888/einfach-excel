//! Dispatches text format formula functions.

use super::*;

pub(super) fn eval_fn_text_format(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"REPT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = text_v {
                return Value::Error(e);
            }
            let n_v = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = n_v {
                return Value::Error(e);
            }
            let n_f = match coerce_to_number(&n_v) {
                Some(n) => n,
                None => return Value::Error(ValueError::WrongType),
            };
            // trunc, reject negative
            let n_trunc = n_f.trunc();
            if n_trunc < 0.0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let n = n_trunc as usize;
            if n == 0 {
                return Value::Text(String::new());
            }
            let text = coerce_to_text(&text_v);
            let char_count = text.chars().count();
            // Char-count cap (Excel: 32767).
            let total = char_count.checked_mul(n);
            match total {
                Some(t) if t <= 32767 => {
                    let mut out = String::with_capacity(text.len() * n);
                    for _ in 0..n {
                        out.push_str(&text);
                    }
                    Value::Text(out)
                }
                _ => Value::Error(ValueError::InvalidValue),
            }
        }

        // EXACT(a, b) — case-sensitive text equality.
        "EXACT" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = eval_expr_with_provider(&args[1], provider);
            if let Value::Error(e) = b {
                return Value::Error(e);
            }
            Value::Boolean(coerce_to_text(&a) == coerce_to_text(&b))
        }

        // VALUE(text) — coerce text to number.
        "VALUE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(e) => Value::Error(e),
                Value::Number(n) => Value::Number(n),
                Value::Boolean(true) => Value::Number(1.0),
                Value::Boolean(false) => Value::Number(0.0),
                Value::Null => Value::Number(0.0),
                Value::Text(s) => match s.trim().parse::<f64>() {
                    Ok(n) => Value::Number(n),
                    Err(_) => Value::Error(ValueError::InvalidValue),
                },
                // Dynamic-array: collapse to top-left. Phase 1 unreachable
                // — no constructor produces Array yet.
                Value::Array(arr) => match arr.get(0, 0).cloned().unwrap_or(Value::Null) {
                    Value::Number(n) => Value::Number(n),
                    Value::Boolean(true) => Value::Number(1.0),
                    Value::Boolean(false) | Value::Null => Value::Number(0.0),
                    Value::Text(s) => match s.trim().parse::<f64>() {
                        Ok(n) => Value::Number(n),
                        Err(_) => Value::Error(ValueError::InvalidValue),
                    },
                    Value::Error(e) => Value::Error(e),
                    Value::Array(_) => Value::Error(ValueError::WrongType),
                    Value::Lambda(_) => Value::Error(ValueError::WrongType),
                },
                // VALUE(lambda) — type error.
                Value::Lambda(_) => Value::Error(ValueError::WrongType),
            }
        }

        // T(v) — return Text if v is text, otherwise empty text.
        "T" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(e) => Value::Error(e),
                Value::Text(s) => Value::Text(s),
                _ => Value::Text(String::new()),
            }
        }

        // CHAR(n) — full Unicode 1..=1_114_111 (broader than Excel's 1..=255).
        "CHAR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let n_f = match coerce_to_number(&v) {
                Some(n) => n.trunc(),
                None => return Value::Error(ValueError::WrongType),
            };
            if !(1.0..=1_114_111.0).contains(&n_f) {
                return Value::Error(ValueError::InvalidValue);
            }
            match char::from_u32(n_f as u32) {
                Some(c) => Value::Text(c.to_string()),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // CODE(text) — first char code point.
        "CODE" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            let s = coerce_to_text(&v);
            match s.chars().next() {
                Some(c) => Value::Number(c as u32 as f64),
                None => Value::Error(ValueError::InvalidValue),
            }
        }

        // CLEAN(text) — strip ASCII control chars (0..=31).
        "CLEAN" => text_unary(args, provider, |s| {
            s.chars().filter(|c| (*c as u32) > 31).collect()
        }),

        // PROPER(text) — capitalize first alpha of each word.
        "PROPER" => text_unary(args, provider, |s| {
            let mut out = String::with_capacity(s.len());
            let mut start_of_word = true;
            for c in s.chars() {
                if c.is_alphabetic() {
                    if start_of_word {
                        for u in c.to_uppercase() {
                            out.push(u);
                        }
                    } else {
                        for u in c.to_lowercase() {
                            out.push(u);
                        }
                    }
                    start_of_word = false;
                } else {
                    out.push(c);
                    start_of_word = true;
                }
            }
            out
        }),

        // TEXTJOIN(delim, ignore_empty, ...). 见 `text_join_delimited`。
        "TEXTJOIN" => text_join_delimited(args, provider),

        // === Reference / lookup ===
        // ROW([ref]) — return the 1-based row number of `ref`. `ref` must be a
        // direct cell/range/sheet-ref/sheet-range expression (we do not
        // evaluate it; we read its anchor row).
        "DOLLAR" => fn_dollar(args, provider),
        "FIXED" => fn_fixed(args, provider),
        "CONCAT" => eval_func("CONCATENATE", args, provider),

        // TRANSLATE(text, find, replace) — map each codepoint found in
        // `find` to the codepoint at the same index in `replace`. A `find`
        // codepoint with no replacement is deleted; duplicate `find`
        // codepoints keep the first mapping.
        "TRANSLATE" => {
            if args.len() != 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let text = match eval_text_arg(&args[0], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };
            let find = match eval_text_arg(&args[1], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };
            let replace = match eval_text_arg(&args[2], provider) {
                Ok(text) => text,
                Err(e) => return Value::Error(e),
            };

            let replace_chars: Vec<char> = replace.chars().collect();
            let mut map: HashMap<char, Option<char>> = HashMap::new();
            for (idx, ch) in find.chars().enumerate() {
                map.entry(ch)
                    .or_insert_with(|| replace_chars.get(idx).copied());
            }

            let mut out = String::new();
            for ch in text.chars() {
                match map.get(&ch) {
                    Some(Some(mapped)) => out.push(*mapped),
                    Some(None) => {}
                    None => out.push(ch),
                }
            }
            Value::Text(out)
        }

        // ===== ARMS REGISTRY: ADD NEW MATCH ARMS BEFORE THIS LINE =====
        // Sentinel for parallel-agent merges — every new built-in dispatch arm
        // (e.g. `"PRICE" => eval_price(args, provider)`) goes BEFORE this
        // marker so concurrent worktrees don't fight over the `_ =>` line.
        // TEXTSPLIT(text, col_delim[, row_delim[, ignore_empty[, match_mode[, pad_with]]]])
        //
        // Splits `text` on `col_delim` (and `row_delim` if given) into a
        // 2D array. `col_delim` may be a single string OR an array of
        // strings — every occurrence of any element splits.
        //
        // - `ignore_empty` (default FALSE) skips empty fragments.
        // - `match_mode`: 0 case-sensitive (default), 1 case-insensitive.
        // - `pad_with` fills jagged-row slots; default is the #N/A-style
        //   `ValueError::InvalidValue`.
        //
        // Empty `text` → 1×1 array containing "" (Excel parity).
        "TEXTSPLIT" => fn_textsplit(args, provider),

        // TEXTBEFORE / TEXTAFTER — slice `text` around the Nth occurrence
        // of `delimiter`. See `fn_text_before_after` for the shared
        // search engine. `instance_num` < 0 counts from the right.
        "TEXTBEFORE" => fn_text_before_after(args, provider, /* before = */ true),
        "TEXTAFTER" => fn_text_before_after(args, provider, /* before = */ false),

        // LOOKUP(needle, lookup_vector[, result_vector])
        //
        // Vector form: linear "exact-or-next-smaller" walk like VLOOKUP
        // approximate (the input is supposed to be ascending; we don't
        // verify). Two-arg form with a 2D second argument flips into the
        // "array form" — pick the longer dimension as the lookup vector
        // and the opposite end of the other dimension as the result.
        "ENCODEURL" => fn_encodeurl(args, provider),
        _ => unreachable!(),
    }
}
