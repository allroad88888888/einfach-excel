use super::*;

pub(super) fn fn_textsplit(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    // `col_delim` 是必填的：下面直接索引 `args[1]`，只挡 `args.is_empty()`
    // 时 `=TEXTSPLIT("a")` 会 panic（index out of bounds），在 WASM 里等于
    // 一条公式打死 worker。TS 参考引擎判的是 `args.length < 2`，这里向它收敛。
    if args.len() < 2 || args.len() > 6 {
        return Value::Error(ValueError::WrongArgCount);
    }
    // text
    let text_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = &text_v {
        return Value::Error(e.clone());
    }
    let text = coerce_to_text(&text_v);

    // col_delim
    let col_v = eval_expr_with_provider(&args[1], provider);
    let col_delims = match collect_textsplit_delims(&col_v, false) {
        Ok(v) => v,
        Err(e) => return Value::Error(e),
    };

    // row_delim (optional)
    let row_delims = if args.len() >= 3 {
        let v = eval_expr_with_provider(&args[2], provider);
        match v {
            Value::Null => Vec::new(),
            v => match collect_textsplit_delims(&v, false) {
                Ok(d) => d,
                Err(e) => return Value::Error(e),
            },
        }
    } else {
        Vec::new()
    };

    // ignore_empty (default FALSE)
    let ignore_empty = if args.len() >= 4 {
        let v = eval_expr_with_provider(&args[3], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        coerce_to_bool(&v).unwrap_or(false)
    } else {
        false
    };

    // match_mode (default 0)
    let match_mode: i64 = if args.len() >= 5 {
        let v = eval_expr_with_provider(&args[4], provider);
        if let Value::Error(e) = v {
            return Value::Error(e);
        }
        match coerce_to_number(&v) {
            Some(n) => n.trunc() as i64,
            None => return Value::Error(ValueError::InvalidValue),
        }
    } else {
        0
    };
    if !matches!(match_mode, 0 | 1) {
        return Value::Error(ValueError::InvalidValue);
    }

    // Empty text — Excel returns a 1×1 with "" regardless of delims.
    if text.is_empty() {
        return Value::Array(Arc::new(ArrayData::new(
            1,
            1,
            vec![Value::Text(String::new())],
        )));
    }

    if row_delims.is_empty() {
        // 1×N column-split. Drop empty fragments per `ignore_empty`.
        let fragments = textsplit_one_axis(&text, &col_delims, ignore_empty, match_mode);
        let cols = fragments.len().max(1) as u32;
        let data: Vec<Value> = fragments.into_iter().map(Value::Text).collect();
        return Value::Array(Arc::new(ArrayData::new(1, cols, data)));
    }

    // 2D split. Outer = rows, inner = cols. We first split on row
    // delimiters, then each row on column delimiters. Pad jagged rows
    // with `pad`.
    let rows_raw = textsplit_one_axis(&text, &row_delims, ignore_empty, match_mode);
    let mut grid: Vec<Vec<String>> = Vec::with_capacity(rows_raw.len());
    let mut max_cols = 0usize;
    for row in &rows_raw {
        let cols = textsplit_one_axis(row, &col_delims, ignore_empty, match_mode);
        if cols.len() > max_cols {
            max_cols = cols.len();
        }
        grid.push(cols);
    }
    if grid.is_empty() {
        return Value::Array(Arc::new(ArrayData::new(
            1,
            1,
            vec![Value::Text(String::new())],
        )));
    }
    if max_cols == 0 {
        max_cols = 1;
    }
    let r = grid.len() as u32;
    let c = max_cols as u32;
    // 格数闸门。TEXTSPLIT 的输出是**两轴分隔符个数之积**，对长度 L 的文本最坏
    // (L/2)²；到这里为止的分配都还是线性的（`grid` 里的 String 总数 ≤ L + 行数），
    // 二次爆炸只发生在下面按 `max_cols` 补齐 pad 的那一步 —— 所以闸门必须钉在
    // `Vec::with_capacity` 之前。实测 `REPT(";",16383)&REPT(",",16383)`（32766
    // 字符，公式能造出的最长文本量级）= 16384 × 16384 = 268,435,456 格 ≈ 6.4 GB。
    //
    // 只数格数，**不看行列各自是否越网格** —— 后者是 `DYNAMIC_ARRAY_CELL_CAP`
    // 注释里登记的那条未决分歧，不在这里顺手统一。
    // 口径与 SEQUENCE / EXPAND / MAKEARRAY 等同一个 `checked_array_len`。
    //
    // 1×N 分支（`row_delims` 为空）不需要这道闸门：它的格数 = 片段数 ≤ L + 1，
    // 是线性的，而公式能造出的最长文本被 REPT / CONCAT / TEXTJOIN 卡在 32767
    // 字符 → 最坏 32768 格，只有上限的 3%。
    let cap = match checked_array_len(r as u64, c as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let mut data: Vec<Value> = Vec::with_capacity(cap);
    let pad_arg = args.get(5);
    let mut pad: Option<Value> = None;
    for row in grid {
        for j in 0..max_cols {
            if j < row.len() {
                data.push(Value::Text(row[j].clone()));
            } else {
                let pad_value = pad
                    .get_or_insert_with(|| {
                        eval_optional_value_arg(
                            pad_arg,
                            provider,
                            Value::Error(ValueError::NotAvailable),
                        )
                    })
                    .clone();
                data.push(pad_value);
            }
        }
    }
    Value::Array(Arc::new(ArrayData::new(r, c, data)))
}
