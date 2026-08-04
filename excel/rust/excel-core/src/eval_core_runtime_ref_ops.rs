use super::*;

pub(super) fn top_left_runtime_ref(mut r: RuntimeRef) -> RuntimeRef {
    let n = r.normalized();
    let materialized = r.materialized.take().map(|arr| {
        Arc::new(ArrayData::new(
            1,
            1,
            vec![arr.get(0, 0).cloned().unwrap_or(Value::Null)],
        ))
    });
    RuntimeRef {
        sheet: r.sheet,
        range: CellRange::single(n.start),
        materialized,
    }
}

pub(super) fn runtime_ref_from_spill(
    anchor: &Expr,
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    let (sheet, addr) = match anchor {
        Expr::CellRef(addr, _) => (None, *addr),
        Expr::SheetRef { sheet, addr, .. } => (Some(sheet.clone()), *addr),
        _ => return Err(ValueError::InvalidRef),
    };
    let raw = match &sheet {
        Some(s) => provider.raw_sheet_cell(s, addr),
        None => provider.raw_cell(addr),
    };
    match raw {
        Value::Array(arr) => {
            let (rows, cols) = arr.shape();
            if rows == 0 || cols == 0 {
                return Err(ValueError::InvalidRef);
            }
            let end = CellAddress::new(addr.row + rows - 1, addr.col + cols - 1);
            Ok(RuntimeRef {
                sheet,
                range: CellRange::new(addr, end),
                materialized: Some(arr),
            })
        }
        Value::Error(e) => Err(e),
        _ => Err(ValueError::InvalidRef),
    }
}

pub(super) fn runtime_ref_from_indirect(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    if args.is_empty() || args.len() > 2 {
        return Err(ValueError::WrongArgCount);
    }
    let ref_v = eval_expr_with_provider(&args[0], provider);
    if let Value::Error(e) = ref_v {
        return Err(e);
    }
    let a1 = if args.len() == 2 {
        let v = eval_expr_with_provider(&args[1], provider);
        if let Value::Error(e) = v {
            return Err(e);
        }
        coerce_to_bool(&v).ok_or(ValueError::WrongType)?
    } else {
        true
    };
    if !a1 {
        return Err(ValueError::InvalidRef);
    }
    let text = coerce_to_text(&ref_v);
    let (sheet, start, end) = parse_indirect_ref(&text).ok_or(ValueError::InvalidRef)?;
    Ok(RuntimeRef {
        sheet,
        range: CellRange::new(start, end),
        materialized: None,
    })
}

pub(super) fn runtime_ref_from_index(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<RuntimeRef, ValueError> {
    if args.len() < 2 || args.len() > 3 {
        return Err(ValueError::WrongArgCount);
    }
    let source = runtime_ref_from_expr(&args[0], provider)?;
    let (height, width) = source.bounded_shape().ok_or(ValueError::InvalidValue)?;
    let row = match coerce_to_number(&eval_expr_with_provider(&args[1], provider)) {
        Some(n) if n.is_finite() => n.trunc() as i64,
        _ => return Err(ValueError::WrongType),
    };
    let col_explicit = args.len() == 3;
    let col = if col_explicit {
        match coerce_to_number(&eval_expr_with_provider(&args[2], provider)) {
            Some(n) if n.is_finite() => n.trunc() as i64,
            _ => return Err(ValueError::WrongType),
        }
    } else {
        1
    };
    if row < 0 || col < 0 {
        return Err(ValueError::InvalidRef);
    }
    let row = u32::try_from(row).map_err(|_| ValueError::InvalidRef)?;
    let col = u32::try_from(col).map_err(|_| ValueError::InvalidRef)?;

    if !col_explicit {
        if height == 1 {
            if row == 0 {
                return Ok(source);
            }
            if row > width {
                return Err(ValueError::InvalidRef);
            }
            return source.slice(0, 1, row - 1, 1).ok_or(ValueError::InvalidRef);
        }
        if width == 1 {
            if row == 0 {
                return Ok(source);
            }
            if row > height {
                return Err(ValueError::InvalidRef);
            }
            return source.slice(row - 1, 1, 0, 1).ok_or(ValueError::InvalidRef);
        }
        return Err(ValueError::InvalidValue);
    }

    match (row, col) {
        (0, 0) => Ok(source),
        (0, c) => {
            if c > width {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(0, height, c - 1, 1)
                .ok_or(ValueError::InvalidRef)
        }
        (r, 0) => {
            if r > height {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(r - 1, 1, 0, width)
                .ok_or(ValueError::InvalidRef)
        }
        (r, c) => {
            if r > height || c > width {
                return Err(ValueError::InvalidRef);
            }
            source
                .slice(r - 1, 1, c - 1, 1)
                .ok_or(ValueError::InvalidRef)
        }
    }
}
