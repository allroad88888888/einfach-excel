//! Dispatches logical formula functions.

use super::*;

pub(super) fn eval_fn_logical(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"IF" => {
            if args.len() < 2 || args.len() > 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let cond = eval_expr_with_provider(&args[0], provider);
            let is_true = match cond {
                Value::Boolean(b) => b,
                Value::Number(n) => n != 0.0,
                Value::Error(e) => return Value::Error(e),
                _ => false,
            };
            if is_true {
                eval_expr_with_provider(&args[1], provider)
            } else if args.len() == 3 {
                eval_expr_with_provider(&args[2], provider)
            } else {
                Value::Boolean(false)
            }
        }

        "AND" => {
            let mut result = true;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                result = result && b;
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(result)
            }
        }
        "OR" => {
            let mut result = false;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                result = result || b;
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(result)
            }
        }
        "NOT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match coerce_to_bool(&v) {
                Some(b) => Value::Boolean(!b),
                None => match v {
                    Value::Error(e) => Value::Error(e),
                    _ => Value::Error(ValueError::WrongType),
                },
            }
        }

        // === Math ===
        "IFERROR" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(_) => eval_expr_with_provider(&args[1], provider),
                other => other,
            }
        }
        "IFNA" => {
            if args.len() != 2 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Error(ValueError::NotAvailable) => {
                    eval_expr_with_provider(&args[1], provider)
                }
                other => other,
            }
        }
        "IFS" => {
            // IFS(cond1, val1, cond2, val2, ...) — variadic; pairs only.
            if args.is_empty() || args.len() % 2 != 0 {
                return Value::Error(ValueError::InvalidValue);
            }
            let mut i = 0;
            while i < args.len() {
                let cond = eval_expr_with_provider(&args[i], provider);
                if let Value::Error(e) = cond {
                    return Value::Error(e);
                }
                let is_true = match cond {
                    Value::Boolean(b) => b,
                    Value::Number(n) => n != 0.0,
                    _ => false,
                };
                if is_true {
                    return eval_expr_with_provider(&args[i + 1], provider);
                }
                i += 2;
            }
            Value::Error(ValueError::InvalidValue)
        }
        "SWITCH" => {
            // SWITCH(expr, case1, val1, [case2, val2, ...], [default]).
            // Need at least expr + one (case, val) pair = 3 args.
            if args.len() < 3 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let expr_v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = expr_v {
                return Value::Error(e);
            }
            // After the leading expr we walk (case, val) pairs. An odd
            // remainder after the leading arg is the default.
            let rest = &args[1..];
            let mut i = 0;
            while i + 1 < rest.len() {
                let case_v = eval_expr_with_provider(&rest[i], provider);
                if values_equal(&expr_v, &case_v) {
                    return eval_expr_with_provider(&rest[i + 1], provider);
                }
                i += 2;
            }
            // Trailing default?
            if i < rest.len() {
                return eval_expr_with_provider(&rest[i], provider);
            }
            Value::Error(ValueError::InvalidValue)
        }
        "XOR" => {
            // Variadic; result = (count of TRUE is odd). Errors propagate;
            // non-coercible values surface as WrongType.
            if args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            let mut true_count = 0u64;
            let mut saw_any = false;
            let mut err: Option<ValueError> = None;
            for arg in args {
                if err.is_some() {
                    break;
                }
                for_each_arg_value(arg, provider, &mut |_addr, v| {
                    if err.is_some() {
                        return;
                    }
                    match v {
                        Value::Error(e) => err = Some(e),
                        Value::Null => {}
                        other => match coerce_to_bool(&other) {
                            Some(b) => {
                                saw_any = true;
                                if b {
                                    true_count += 1;
                                }
                            }
                            None => err = Some(ValueError::WrongType),
                        },
                    }
                });
            }
            if let Some(e) = err {
                Value::Error(e)
            } else if !saw_any {
                Value::Error(ValueError::WrongArgCount)
            } else {
                Value::Boolean(true_count % 2 == 1)
            }
        }

        // === IS* family — never propagate errors, they classify them. ===
        "TRUE" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Boolean(true)
        }
        "FALSE" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Boolean(false)
        }

        // NA() — zero-arg. Returns the #N/A sentinel.
        // Useful as a placeholder while sketching a sheet.
        "NA" => {
            if !args.is_empty() {
                return Value::Error(ValueError::WrongArgCount);
            }
            Value::Error(ValueError::NotAvailable)
        }

        // ISREF(value) — TRUE iff the argument expression is a
        // reference. Inspects the AST directly (mirrors AREAS): a bare
        // `CellRef`, `Range`, `SheetRef`, `SheetRange`, or `MultiArea`
        // counts. Named references are NOT followed — Excel does
        // follow them, but our named registry stores values rather
        // than references, so a named "x = A1" stores `10`, not the
        // ref to A1. Refining that requires storing the source Expr
        // for each name; we deliberately defer.
                _ => unreachable!(),
    }
}
