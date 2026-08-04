//! Dispatches information classification formula functions.

use super::*;

pub(super) fn eval_fn_information_classification(
    name: &str,
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Value {
    match name {"ISNUMBER" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Number(_)))
        }
        "ISTEXT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Text(_)))
        }
        "ISBLANK" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Null))
        }
        "ISERROR" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(_)))
        }
        "ISERR" => {
            // Excel: ISERR = ISERROR and not #N/A.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(e) if !matches!(e, ValueError::NotAvailable)))
        }
        "ISNA" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Error(ValueError::NotAvailable)))
        }
        "ISLOGICAL" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(matches!(v, Value::Boolean(_)))
        }
        "ISNONTEXT" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            Value::Boolean(!matches!(v, Value::Text(_)))
        }
        "ISEVEN" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => Value::Boolean((n.trunc() as i64) % 2 == 0),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "ISODD" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            match coerce_to_number(&v) {
                Some(n) => Value::Boolean((n.trunc() as i64) % 2 != 0),
                None => Value::Error(ValueError::WrongType),
            }
        }
        "N" => {
            // Excel quirk: N("anything") = 0; bool → 1/0; null → 0; error
            // propagates.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            match v {
                Value::Number(n) => Value::Number(n),
                Value::Boolean(true) => Value::Number(1.0),
                Value::Boolean(false) => Value::Number(0.0),
                Value::Null => Value::Number(0.0),
                Value::Text(_) => Value::Number(0.0),
                Value::Error(e) => Value::Error(e),
                // Dynamic-array: collapse to top-left then re-classify.
                // Phase 1 unreachable until a constructor produces Array.
                Value::Array(arr) => match arr.get(0, 0).cloned().unwrap_or(Value::Null) {
                    Value::Number(n) => Value::Number(n),
                    Value::Boolean(true) => Value::Number(1.0),
                    _ => Value::Number(0.0),
                },
                // N of a lambda is meaningless — return 0 (Excel would
                // surface #VALUE!; we keep the existing tolerant policy).
                Value::Lambda(_) => Value::Number(0.0),
            }
        }
        "TYPE" => {
            // 1=Number, 2=Text, 4=Boolean, 16=Error. Null coerces to 0
            // (Excel returns 1 for empty cells). Excel uses 64 for arrays.
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let v = eval_expr_with_provider(&args[0], provider);
            let code = match v {
                Value::Number(_) => 1.0,
                Value::Text(_) => 2.0,
                Value::Boolean(_) => 4.0,
                Value::Error(_) => 16.0,
                Value::Null => 1.0,
                Value::Array(_) => 64.0,
                // No Excel code for lambda; closest match is 128 (a value
                // category Excel reserves). Use 128 distinctly so callers
                // can detect lambda-typed values.
                Value::Lambda(_) => 128.0,
            };
            Value::Number(code)
        }

        // === Text expansion (Batch B4) ===
        // FIND(find_text, within_text[, start_num]) — case-sensitive, 1-based.
        // Char-based indexing (never byte offsets on &str).
        "ERROR.TYPE" => fn_error_type(args, provider),
        "ISREF" => {
            if args.len() != 1 {
                return Value::Error(ValueError::WrongArgCount);
            }
            let is_ref = matches!(
                &args[0],
                Expr::CellRef(..)
                    | Expr::Range { .. }
                    | Expr::SheetRef { .. }
                    | Expr::SheetRange { .. }
                    | Expr::MultiArea(_)
            );
            Value::Boolean(is_ref)
        }

        // STDEVP / VARP — legacy aliases for STDEV.P / VAR.P (Excel
        // 2003 names). Population variance / stdev (divide by n).
                _ => unreachable!(),
    }
}
