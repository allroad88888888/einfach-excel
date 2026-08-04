use super::*;

pub(super) fn fn_encodeurl(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 1 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&v);
    let mut out = String::with_capacity(text.len());
    for b in text.bytes() {
        let c = b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push('%');
            out.push_str(&format!("{:02X}", b));
        }
    }
    Value::Text(out)
}
