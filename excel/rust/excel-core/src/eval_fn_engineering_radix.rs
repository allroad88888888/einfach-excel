//! Dispatches engineering radix formula functions.

use super::*;

pub(super) fn eval_fn_engineering_radix(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"OCT2DEC" => eval_xxx2dec(args, provider, 8, 10, 3),
        "HEX2DEC" => eval_xxx2dec(args, provider, 16, 10, 4),
        "DEC2BIN" => eval_dec2xxx(args, provider, 2, 10, 1, false),
        "DEC2OCT" => eval_dec2xxx(args, provider, 8, 10, 3, false),
        "DEC2HEX" => eval_dec2xxx(args, provider, 16, 10, 4, true),
        // Cross-base wrappers: parse via XXX2DEC's base, format via the
        // target's DEC2XXX. We inline both halves rather than recursing
        // through `eval_func` so error propagation stays local.
        "BIN2HEX" => eval_cross_base(args, provider, (2, 10, 1), (16, 10, 4), true),
        "BIN2OCT" => eval_cross_base(args, provider, (2, 10, 1), (8, 10, 3), false),
        "HEX2BIN" => eval_cross_base(args, provider, (16, 10, 4), (2, 10, 1), false),
        "HEX2OCT" => eval_cross_base(args, provider, (16, 10, 4), (8, 10, 3), false),
        "OCT2BIN" => eval_cross_base(args, provider, (8, 10, 3), (2, 10, 1), false),
        "OCT2HEX" => eval_cross_base(args, provider, (8, 10, 3), (16, 10, 4), true),

        // Bitwise ops. Excel's documented domain is 0..=2^48-1; we
        // accept the slightly looser 0..=2^53-1 (the f64 safe-integer
        // range) so values that survive a round-trip through Value
        // stay representable. Fractional / negative / out-of-range
        // inputs surface #NUM!.
        "BITAND" => eval_bit_binop(args, provider, |a, b| a & b),
        "BITOR" => eval_bit_binop(args, provider, |a, b| a | b),
        "BITXOR" => eval_bit_binop(args, provider, |a, b| a ^ b),
        "BITLSHIFT" => eval_bit_shift(args, provider, false),
        "BITRSHIFT" => eval_bit_shift(args, provider, true),

        // DELTA(a[, b=0]) — 1 if a == b else 0. Excel uses #VALUE! for
        // non-numeric args; we use WrongType to match the rest of this
        // module.
        "DELTA" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let a = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = a {
                return Value::Error(e);
            }
            let b = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                v
            } else {
                Value::Number(0.0)
            };
            let (an, bn) = match (as_engineering_number(&a), as_engineering_number(&b)) {
                (Some(x), Some(y)) => (x, y),
                _ => return Value::Error(ValueError::WrongType),
            };
            Value::Number(if an == bn { 1.0 } else { 0.0 })
        }

        // GESTEP(num[, step=0]) — 1 if num >= step else 0.
        "GESTEP" => {
            if args.is_empty() || args.len() > 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let n = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = n {
                return Value::Error(e);
            }
            let s = if args.len() == 2 {
                let v = eval_expr_with_provider(&args[1], provider);
                if let Value::Error(e) = v {
                    return Value::Error(e);
                }
                v
            } else {
                Value::Number(0.0)
            };
            let (nn, sn) = match (as_engineering_number(&n), as_engineering_number(&s)) {
                (Some(x), Some(y)) => (x, y),
                _ => return Value::Error(ValueError::WrongType),
            };
            Value::Number(if nn >= sn { 1.0 } else { 0.0 })
        }

        // === Hyperbolic ===
        // SINH / COSH / TANH / ASINH are total functions over the reals;
        // `unary_number` already collapses non-finite results to
        // `Overflow`, which matches Excel's `#NUM!` for the SINH/COSH
        // explosions at large |n|.
                _ => unreachable!(),
    }
}
