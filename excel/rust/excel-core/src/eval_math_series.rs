use super::*;

pub(super) fn fn_seriessum(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() != 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let xv = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = xv {
        return Value::Error(e);
    }
    let nv = eval_expr_with_provider(&args[1], provider);
    if let Value::Error(e) = nv {
        return Value::Error(e);
    }
    let mv = eval_expr_with_provider(&args[2], provider);
    if let Value::Error(e) = mv {
        return Value::Error(e);
    }
    let x = match coerce_to_number(&xv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    let n_init = match coerce_to_number(&nv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    let m_step = match coerce_to_number(&mv) {
        Some(n) if n.is_finite() => n,
        _ => return Value::Error(ValueError::WrongType),
    };
    // 系数按区域内的**绝对位置**入座，第 i 项的指数是 `n + i*m`。老写法用
    // `push` 排队，稀疏 provider 不发空格，于是 `A1=1 / A2 空 / A3=1` 里的
    // A3 会坐到 i=1（指数 n+m）而不是 i=2 —— 同一份系数写成数组字面量
    // `{1,0,1}` 答案却是对的，两种形态自相矛盾。TS 参考引擎（数组恒稠密）
    // 把空格当 0 且占位，这里对齐它。
    let mut coefs: Vec<f64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value_positioned(&args[3], provider, &mut |pos, v| {
        if err.is_some() {
            return;
        }
        let coef = match v {
            Value::Error(e) => {
                err = Some(e);
                return;
            }
            Value::Null => 0.0,
            other => match coerce_to_number(&other) {
                Some(n) => n,
                None => {
                    err = Some(ValueError::WrongType);
                    return;
                }
            },
        };
        // 空洞用 0 补齐；上限沿用动态数组那道闸门，免得 `SERIESSUM(x,n,m,A:A)`
        // 里一个孤零零的末行系数逼出一整列的 Vec。
        if pos > DYNAMIC_ARRAY_CELL_CAP {
            err = Some(ValueError::InvalidValue);
            return;
        }
        let idx = (pos - 1) as usize;
        if coefs.len() <= idx {
            coefs.resize(idx + 1, 0.0);
        }
        coefs[idx] = coef;
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if coefs.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let mut total = 0.0_f64;
    for (i, c) in coefs.iter().enumerate() {
        let exponent = n_init + (i as f64) * m_step;
        let term = c * x.powf(exponent);
        if !term.is_finite() {
            return Value::Error(ValueError::Overflow);
        }
        total += term;
    }
    if total.is_finite() {
        Value::Number(total)
    } else {
        Value::Error(ValueError::Overflow)
    }
}
