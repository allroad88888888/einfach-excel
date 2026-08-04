use super::*;

pub(super) fn fn_error_type(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    match v {
        Value::Error(ValueError::DivisionByZero) => Value::Number(2.0),
        Value::Error(ValueError::Null) => Value::Number(1.0),
        Value::Error(ValueError::NotAvailable) => Value::Number(7.0),
        Value::Error(ValueError::InvalidValue) => Value::Number(3.0),
        Value::Error(ValueError::InvalidRef) => Value::Number(4.0),
        Value::Error(ValueError::InvalidName) => Value::Number(5.0),
        Value::Error(ValueError::Overflow) => Value::Number(6.0),
        Value::Error(ValueError::CyclicRef) => Value::Number(4.0),
        Value::Error(ValueError::WrongType) => Value::Number(3.0),
        Value::Error(ValueError::WrongArgCount) => Value::Number(3.0),
        Value::Error(ValueError::Spill) => Value::Number(9.0),
        Value::Error(ValueError::Calc) => Value::Number(14.0),
        _ => Value::Error(ValueError::NotAvailable),
    }
}
