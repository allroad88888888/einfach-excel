use super::*;

pub(super) fn fn_xmatch(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.len() < 2 || args.len() > 4 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let needle = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = needle {
        return Value::Error(e);
    }
    let match_mode: i32 = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() => n as i32,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        0
    };
    if !matches!(match_mode, -1 | 0 | 1 | 2) {
        return Value::Error(ValueError::InvalidValue);
    }
    let search_mode: i32 = if args.len() == 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) if n.is_finite() => n as i32,
            _ => return Value::Error(ValueError::WrongType),
        }
    } else {
        1
    };
    if !matches!(search_mode, -2 | -1 | 1 | 2) {
        return Value::Error(ValueError::InvalidValue);
    }
    // `items` 与 `positions` 一一对应：前者是**发出来的**格子（稀疏 provider
    // 会跳过空格），后者是每个格子在区域内的**绝对位置**。返回值取
    // `positions[i]` 而不是 `i + 1` —— 否则空格不占位，`A1=1 / A2 空 / A3=3`
    // 时 `XMATCH(3,A1:A3)` 会答 2 而不是 Excel 的 3。与 `MATCH` 同一根因。
    //
    // 只压缩不补齐（而不是把区域摊平成稠密数组）是刻意的：`XMATCH(x, A:A)`
    // 的稠密形态是 1,048,576 个槽，代价与这个函数的稀疏遍历初衷相反。
    let mut items: Vec<Value> = Vec::new();
    let mut positions: Vec<u64> = Vec::new();
    let mut err: Option<ValueError> = None;
    for_each_arg_value_positioned(&args[1], provider, &mut |pos, v| {
        if err.is_some() {
            return;
        }
        if let Value::Error(e) = &v {
            err = Some(e.clone());
            return;
        }
        items.push(v);
        positions.push(pos);
    });
    if let Some(e) = err {
        return Value::Error(e);
    }
    if items.is_empty() {
        return Value::Error(ValueError::InvalidValue);
    }
    let wildcard_pattern: Option<String> = match (&needle, match_mode) {
        (Value::Text(p), 2) => Some(p.clone()),
        (Value::Text(p), 0) if pattern_has_wildcard(p) => Some(p.clone()),
        _ => None,
    };
    let test_exact = |v: &Value| -> bool {
        match &wildcard_pattern {
            Some(p) => wildcard_match(p, &coerce_to_text(v)),
            None => values_equal(v, &needle),
        }
    };

    if matches!(search_mode, 2 | -2) {
        if wildcard_pattern.is_some() {
            return Value::Error(ValueError::InvalidValue);
        }
        let n = items.len();
        let mut lo = 0usize;
        let mut hi = n;
        let ascending = search_mode == 2;
        while lo < hi {
            let mid = (lo + hi) / 2;
            let ord = compare_lookup(&items[mid], &needle);
            if ord == std::cmp::Ordering::Equal {
                return Value::Number(positions[mid] as f64);
            }
            let go_right = if ascending {
                ord == std::cmp::Ordering::Less
            } else {
                ord == std::cmp::Ordering::Greater
            };
            if go_right {
                lo = mid + 1;
            } else {
                hi = mid;
            }
        }
        if match_mode == 0 || match_mode == 2 {
            return Value::Error(ValueError::NotAvailable);
        }
    }

    let n = items.len();
    let order: Box<dyn Iterator<Item = usize>> = if search_mode == -1 {
        Box::new((0..n).rev())
    } else {
        Box::new(0..n)
    };
    let mut best: Option<usize> = None;
    let mut best_diff: Option<f64> = None;
    let needle_num = coerce_to_number(&needle);
    for i in order {
        let v = &items[i];
        if test_exact(v) {
            return Value::Number(positions[i] as f64);
        }
        if matches!(match_mode, -1 | 1) {
            if let (Some(needle_n), Some(item_n)) = (needle_num, coerce_to_number(v)) {
                if match_mode == -1 && item_n <= needle_n {
                    let diff = needle_n - item_n;
                    if best_diff.map_or(true, |bd| diff < bd) {
                        best = Some(i);
                        best_diff = Some(diff);
                    }
                } else if match_mode == 1 && item_n >= needle_n {
                    let diff = item_n - needle_n;
                    if best_diff.map_or(true, |bd| diff < bd) {
                        best = Some(i);
                        best_diff = Some(diff);
                    }
                }
            }
        }
    }
    match best {
        Some(i) => Value::Number(positions[i] as f64),
        None => Value::Error(ValueError::NotAvailable),
    }
}
