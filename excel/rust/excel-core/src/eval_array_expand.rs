use super::*;

pub(super) fn fn_expand(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let (rows, cols, data) = match arg_to_2d(&args[0], provider) {
        Ok(t) => t,
        Err(e) => return Value::Error(e),
    };
    if rows == 0 || cols == 0 {
        return Value::Error(ValueError::InvalidValue);
    }
    let new_rows = {
        let v = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() && n.trunc() >= 1.0 => n.trunc() as u32,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    };
    let new_cols = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() && n.trunc() >= 1.0 => n.trunc() as u32,
            _ => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        cols
    };
    let pad = if args.len() == 4 {
        eval_expr_with_provider(&args[3], provider)
    } else {
        Value::Error(ValueError::NotAvailable)
    };
    if new_rows < rows || new_cols < cols {
        return Value::Error(ValueError::InvalidValue);
    }
    // 格数闸门。EXPAND 的输出尺寸**只由两个标量实参决定**，与输入数组无关 ——
    // 少了这一道，`=EXPAND(1,4294967295,4294967295)` 直接把 `Vec::with_capacity`
    // 顶到 capacity overflow（panic，不是错误值），在 WASM 里就是一条公式打死
    // worker。口径与 SEQUENCE / MAKEARRAY / TAKE 等同一个 `checked_array_len`。
    let cap = match checked_array_len(new_rows as u64, new_cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut out: Vec<Value> = Vec::with_capacity(cap);
    for r in 0..new_rows {
        for c in 0..new_cols {
            if r < rows && c < cols {
                out.push(data[(r as usize) * (cols as usize) + (c as usize)].clone());
            } else {
                out.push(pad.clone());
            }
        }
    }
    Value::Array(Arc::new(ArrayData::new(new_rows, new_cols, out)))
}
