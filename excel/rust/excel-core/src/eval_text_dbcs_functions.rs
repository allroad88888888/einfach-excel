use super::*;

pub(super) fn fn_lenb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    Value::Number(dbcs_byte_len(&coerce_to_text(&v)) as f64)
}

pub(super) fn fn_leftb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    let n = if args.len() == 2 {
        let nv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = nv {
            return Value::Error(e);
        }
        match coerce_to_number(&nv) {
            Some(x) if x >= 0.0 => x.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    Value::Text(dbcs_take_left(&s, n))
}

pub(super) fn fn_rightb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let s = coerce_to_text(&v);
    let n = if args.len() == 2 {
        let nv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = nv {
            return Value::Error(e);
        }
        match coerce_to_number(&nv) {
            Some(x) if x >= 0.0 => x.trunc() as usize,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        1
    };
    Value::Text(dbcs_take_right(&s, n))
}

pub(super) fn fn_midb(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let sv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = sv {
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
    let start = match coerce_to_number(&start_v) {
        Some(n) if n >= 1.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let num = match coerce_to_number(&num_v) {
        Some(n) if n >= 0.0 => n.trunc() as usize,
        _ => return Value::Error(ValueError::InvalidValue),
    };
    let s = coerce_to_text(&sv);
    Value::Text(dbcs_mid(&s, start, num))
}

/// FINDB / SEARCHB shared byte-positioning engine. Returns Excel-style
/// 1-based byte index of the first match, or `Err(InvalidValue)` if no
/// match. `case_insensitive` mirrors SEARCH semantics.
pub(super) fn dbcs_find_byte_index(
    needle: &str,
    haystack: &str,
    start_byte: usize,
    case_insensitive: bool,
) -> Result<usize, ValueError> {
    let total_bytes = dbcs_byte_len(haystack);
    if needle.is_empty() {
        if start_byte > total_bytes + 1 {
            return Err(ValueError::InvalidValue);
        }
        return Ok(start_byte);
    }
    if start_byte == 0 || start_byte > total_bytes {
        return Err(ValueError::InvalidValue);
    }
    let mut h_chars: Vec<char> = Vec::new();
    let mut h_offsets: Vec<usize> = Vec::new();
    {
        let mut off = 0usize;
        for c in haystack.chars() {
            h_chars.push(c);
            h_offsets.push(off);
            off += dbcs_byte_width(c);
        }
    }
    let needle_chars: Vec<char> = needle.chars().collect();
    let n_norm: Vec<char> = if case_insensitive {
        needle_chars.iter().flat_map(|c| c.to_lowercase()).collect()
    } else {
        needle_chars
    };
    for i in 0..h_chars.len() {
        let first_byte = h_offsets[i] + 1;
        if first_byte < start_byte {
            continue;
        }
        if i + n_norm.len() > h_chars.len() {
            break;
        }
        let slice = &h_chars[i..i + n_norm.len()];
        let cmp_eq = if case_insensitive {
            let lower: Vec<char> = slice.iter().flat_map(|c| c.to_lowercase()).collect();
            lower == n_norm
        } else {
            slice == n_norm.as_slice()
        };
        if cmp_eq {
            return Ok(first_byte);
        }
    }
    Err(ValueError::InvalidValue)
}

// ---- Regression + matrix algebra helpers (P batch) ---------------------
//
// Numerical strategy:
//   * Least-squares (LINEST/LOGEST/TREND/GROWTH/FORECAST) solve the
//     normal equations `(X^T X) β = X^T y` via in-place Gauss-Jordan on
//     the (k+1)×(k+2) augmented matrix. This is adequate for the
//     workbook-scale problems we expect (≤ ~50 variables). For larger /
//     near-collinear inputs we surface `#NUM!` (Overflow) when the
//     pivot drops below 1e-12, matching MINVERSE's singular guard.
//   * MINVERSE row-reduces `[A | I]` to `[I | A^-1]` with partial
//     pivoting. Same 1e-12 singular tolerance.
//   * MMULT is the textbook triple-loop (a×b)·(b×c) → (a×c). No BLAS
//     dependency; sizes are bounded by the workbook (1M-element cap).
//   * MUNIT / TRANSPOSE are O(n²) shape transforms.
//
// All array-producing functions return `Value::Array(Arc::new(...))`
// and are listed in `sheet::expr_may_produce_array` so the spill
// machinery picks them up.
