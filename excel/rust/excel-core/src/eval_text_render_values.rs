use super::*;

pub(super) fn quote_strict_text(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for c in s.chars() {
        if c == '"' {
            out.push('"');
            out.push('"');
        } else {
            out.push(c);
        }
    }
    out.push('"');
    out
}

pub(super) fn render_value_to_text(v: &Value, strict: bool) -> String {
    match v {
        Value::Text(s) => {
            if strict {
                quote_strict_text(s)
            } else {
                s.clone()
            }
        }
        Value::Null => String::new(),
        _ => coerce_to_text(v),
    }
}

pub(super) fn fn_valuetotext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = v {
        return Value::Error(e);
    }
    let strict = if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        match coerce_to_number(&fv) {
            Some(n) => n.trunc() == 1.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        false
    };
    // Array unwrap: a Value::Array reaching here (e.g. from a nested
    // formula that spilled) should serialise the entire array, not just
    // the top-left scalar. ARRAYTOTEXT is the canonical entrypoint for
    // that; reuse it.
    if let Value::Array(arr) = &v {
        return render_array_to_text(arr, strict);
    }
    Value::Text(render_value_to_text(&v, strict))
}

pub(super) fn fn_arraytotext(args: &[Expr], provider: &dyn EvalProvider) -> Value {
    if args.is_empty() || args.len() > 2 {
        return Value::Error(ValueError::WrongArgCount);
    }
    let strict = if args.len() == 2 {
        let fv = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = fv {
            return Value::Error(e);
        }
        match coerce_to_number(&fv) {
            Some(n) => n.trunc() == 1.0,
            None => return Value::Error(ValueError::WrongType),
        }
    } else {
        false
    };

    // Range / SheetRange / OFFSET / array-producing scalar: walk through
    // `for_each_arg_value` and capture (row, col) so we can serialise in
    // row-major order with `;` row separators. For a Value::Array we get
    // a flat stream; we reconstruct shape from the underlying array.
    //
    // Strategy: detect the input shape via two passes.
    //   - Literal range / sheet range: peek at the AST to recover the
    //     rectangle dimensions.
    //   - Anything else (including OFFSET dynamic ranges and Value::Array
    //     scalars): evaluate once and dispatch on the result.
    //
    // This keeps the implementation small while still emitting the
    // correct row/col grid.
    match &args[0] {
        Expr::Range { start, end, .. } => {
            let range = CellRange::new(*start, *end).normalize();
            let rows = range.end.row - range.start.row + 1;
            let cols = range.end.col - range.start.col + 1;
            let mut grid: Vec<Vec<String>> =
                vec![vec![String::new(); cols as usize]; rows as usize];
            let mut err: Option<ValueError> = None;
            for_each_arg_value(&args[0], provider, &mut |addr, v| {
                if err.is_some() {
                    return;
                }
                if let Value::Error(e) = &v {
                    err = Some(e.clone());
                    return;
                }
                if let Some(a) = addr {
                    let r = (a.row - range.start.row) as usize;
                    let c = (a.col - range.start.col) as usize;
                    grid[r][c] = render_value_to_text(&v, strict);
                }
            });
            if let Some(e) = err {
                return Value::Error(e);
            }
            Value::Text(format_grid(&grid, strict))
        }
        Expr::SheetRange { start, end, .. } => {
            let range = CellRange::new(*start, *end).normalize();
            let rows = range.end.row - range.start.row + 1;
            let cols = range.end.col - range.start.col + 1;
            let mut grid: Vec<Vec<String>> =
                vec![vec![String::new(); cols as usize]; rows as usize];
            let mut err: Option<ValueError> = None;
            for_each_arg_value(&args[0], provider, &mut |addr, v| {
                if err.is_some() {
                    return;
                }
                if let Value::Error(e) = &v {
                    err = Some(e.clone());
                    return;
                }
                if let Some(a) = addr {
                    let r = (a.row - range.start.row) as usize;
                    let c = (a.col - range.start.col) as usize;
                    grid[r][c] = render_value_to_text(&v, strict);
                }
            });
            if let Some(e) = err {
                return Value::Error(e);
            }
            Value::Text(format_grid(&grid, strict))
        }
        _ => {
            let v = eval_expr_with_provider(&args[0], provider);
            if let Value::Error(e) = v {
                return Value::Error(e);
            }
            if let Value::Array(arr) = &v {
                return render_array_to_text(arr, strict);
            }
            // Scalar fallback: a single value emits its text directly
            // (concise) or quoted-text-then-braced (strict). Excel's
            // strict mode wraps even a single scalar in `{...}`; we match.
            let body = render_value_to_text(&v, strict);
            if strict {
                Value::Text(format!("{{{}}}", body))
            } else {
                Value::Text(body)
            }
        }
    }
}
