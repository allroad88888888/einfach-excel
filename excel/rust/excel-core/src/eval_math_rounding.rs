use super::*;

pub(super) fn floor_ceiling_math(args: &[Expr], provider: &dyn EvalProvider, is_floor: bool) -> Value {
    if args.is_empty() || args.len() > 3 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let sig = if args.len() >= 2 {
        let sv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = sv {
            return Value::Error(e);
        }
        match coerce_to_number(&sv) {
            Some(s) => s,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        1.0
    };
    let mode = if args.len() == 3 {
        let mv = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = mv {
            return Value::Error(e);
        }
        match coerce_to_number(&mv) {
            Some(m) => m,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        0.0
    };
    if sig == 0.0 {
        return Value::Number(0.0);
    }
    // FLOOR.MATH / CEILING.MATH treat significance sign as irrelevant —
    // we always divide by |sig|. The direction is controlled by
    // is_floor + mode + sign(n).
    let s = sig.abs();
    let r = if is_floor {
        if n < 0.0 && mode != 0.0 {
            // Round toward zero for negatives.
            (n / s).ceil() * s
        } else {
            (n / s).floor() * s
        }
    } else {
        // CEILING.MATH
        if n < 0.0 && mode != 0.0 {
            // Round away from zero for negatives.
            (n / s).floor() * s
        } else {
            (n / s).ceil() * s
        }
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

/// FLOOR.PRECISE / CEILING.PRECISE shared body. Always toward -inf
/// (FLOOR.PRECISE) or +inf (CEILING.PRECISE). 1 or 2 args.
pub(super) fn floor_ceiling_precise(args: &[Expr], provider: &dyn EvalProvider, is_floor: bool) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let nv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let n = match coerce_to_number(&nv) {
        Some(n) => n,
        None => return Value::Error(ValueError::WrongType),
    };
    let sig = if args.len() == 2 {
        let sv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = sv {
            return Value::Error(e);
        }
        match coerce_to_number(&sv) {
            Some(s) => s,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        1.0
    };
    if sig == 0.0 {
        return Value::Number(0.0);
    }
    let s = sig.abs();
    let r = if is_floor {
        (n / s).floor() * s
    } else {
        (n / s).ceil() * s
    };
    if r.is_finite() {
        Value::Number(r)
    } else {
        Value::Error(ValueError::Overflow)
    }
}

pub(super) const ROMAN_FORM_0: &[(i64, &str)] = &[
    (1000, "M"),
    (900, "CM"),
    (500, "D"),
    (400, "CD"),
    (100, "C"),
    (90, "XC"),
    (50, "L"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
pub(super) const ROMAN_FORM_1: &[(i64, &str)] = &[
    (1000, "M"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
pub(super) const ROMAN_FORM_2: &[(i64, &str)] = &[
    (1000, "M"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
pub(super) const ROMAN_FORM_3: &[(i64, &str)] = &[
    (1000, "M"),
    (995, "VM"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (495, "VD"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
pub(super) const ROMAN_FORM_4: &[(i64, &str)] = &[
    (1000, "M"),
    (999, "IM"),
    (995, "VM"),
    (990, "XM"),
    (950, "LM"),
    (900, "CM"),
    (500, "D"),
    (499, "ID"),
    (495, "VD"),
    (490, "XD"),
    (450, "LD"),
    (400, "CD"),
    (100, "C"),
    (99, "IC"),
    (95, "VC"),
    (90, "XC"),
    (50, "L"),
    (49, "IL"),
    (45, "VL"),
    (40, "XL"),
    (10, "X"),
    (9, "IX"),
    (5, "V"),
    (4, "IV"),
    (1, "I"),
];
pub(super) const ROMAN_FORMS: [&[(i64, &str)]; 5] = [
    ROMAN_FORM_0,
    ROMAN_FORM_1,
    ROMAN_FORM_2,
    ROMAN_FORM_3,
    ROMAN_FORM_4,
];
