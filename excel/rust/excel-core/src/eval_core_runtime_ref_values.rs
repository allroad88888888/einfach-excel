use super::*;

pub(super) fn runtime_ref_to_grid(
    r: &RuntimeRef,
    provider: &dyn EvalProvider,
) -> Option<Vec<Vec<Value>>> {
    if let Some(arr) = &r.materialized {
        let (rows, cols) = arr.shape();
        if checked_array_len(rows as u64, cols as u64).is_err() {
            return Some(vec![]);
        }
        let mut grid = Vec::with_capacity(rows as usize);
        for row in 0..rows {
            let mut cells = Vec::with_capacity(cols as usize);
            for col in 0..cols {
                cells.push(arr.get(row, col).cloned().unwrap_or(Value::Null));
            }
            grid.push(cells);
        }
        return Some(grid);
    }

    let n = r.normalized();
    if n.end.row > EXCEL_MAX_ROWS || n.end.col > EXCEL_MAX_COLS {
        return Some(vec![]);
    }
    let rows = (n.end.row - n.start.row + 1) as usize;
    let cols = (n.end.col - n.start.col + 1) as usize;
    if checked_array_len(rows as u64, cols as u64).is_err() {
        return Some(vec![]);
    }
    let mut grid: Vec<Vec<Value>> = (0..rows).map(|_| vec![Value::Null; cols]).collect();
    let mut fill = |addr: CellAddress, value: Value| {
        if addr.row < n.start.row || addr.row > n.end.row {
            return;
        }
        if addr.col < n.start.col || addr.col > n.end.col {
            return;
        }
        let dr = (addr.row - n.start.row) as usize;
        let dc = (addr.col - n.start.col) as usize;
        grid[dr][dc] = value;
    };
    match &r.sheet {
        Some(sheet) => provider.for_each_sheet_range_cell(sheet, r.range, &mut fill),
        None => provider.for_each_range_cell(r.range, &mut fill),
    }
    Some(grid)
}

pub(super) fn runtime_ref_to_value(r: &RuntimeRef, provider: &dyn EvalProvider) -> Value {
    let Some((rows, cols)) = r.bounded_shape() else {
        return Value::Error(ValueError::InvalidValue);
    };
    if rows == 1 && cols == 1 {
        if let Some(arr) = &r.materialized {
            return arr.get(0, 0).cloned().unwrap_or(Value::Null);
        }
        let addr = r.normalized().start;
        return match &r.sheet {
            Some(sheet) => provider.sheet_cell(sheet, addr),
            None => provider.cell(addr),
        };
    }
    if r.normalized().end.row > EXCEL_MAX_ROWS || r.normalized().end.col > EXCEL_MAX_COLS {
        return Value::Error(ValueError::InvalidValue);
    }
    let cap = match checked_array_len(rows as u64, cols as u64) {
        Ok(cap) => cap,
        Err(e) => return Value::Error(e),
    };
    let Some(grid) = runtime_ref_to_grid(r, provider) else {
        return Value::Error(ValueError::InvalidValue);
    };
    let mut data = Vec::with_capacity(cap);
    for row in grid {
        data.extend(row);
    }
    Value::Array(Arc::new(ArrayData::new(rows, cols, data)))
}

/// Build a 2D grid from an argument expression that is either a same-sheet
/// or cross-sheet range. Routes through `for_each_sheet_range_cell` for
/// cross-sheet ranges so the provider resolves cells against the correct
/// sheet rather than the formula's own sheet.
///
/// Also handles dynamic range expressions: if the argument is `OFFSET(...)`,
/// it is evaluated to a runtime `CellRange` which is then materialised as a
/// 2D grid — so `VLOOKUP(x, OFFSET(A1,0,0,10,2), 2, FALSE)` works correctly.
pub(super) fn collect_range_2d_for_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Option<Vec<Vec<Value>>> {
    runtime_ref_from_expr(arg, provider)
        .ok()
        .and_then(|r| runtime_ref_to_grid(&r, provider))
}

/// Evaluate an `OFFSET(ref, row_off, col_off[, height[, width]])` call and
/// return the resolved `RuntimeRef`, or `None` if arguments are invalid.
/// Row/col offsets are applied to produce the top-left corner; height/width
/// (defaulting to the reference's size) give the extent. All numeric args must be coercible;
/// otherwise returns `None`.
///
/// 复用唯一引用解析入口，Table／命名范围与普通区域拥有相同的锚点和默认尺寸。
/// 计算出来的内存数组没有工作表地址，不能当作 OFFSET 的引用。
pub(super) fn eval_offset_as_range(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Option<RuntimeRef> {
    if args.len() < 3 || args.len() > 5 {
        return None;
    }
    let reference = runtime_ref_from_expr(&args[0], provider).ok()?;
    if reference.materialized.is_some() {
        return None;
    }
    let range = reference.range.normalize();
    let anchor = range.start;
    let row_off = coerce_to_number(&eval_expr_with_provider(&args[1], provider))? as i64;
    let col_off = coerce_to_number(&eval_expr_with_provider(&args[2], provider))? as i64;
    let height = if args.len() >= 4 {
        let h = coerce_to_number(&eval_expr_with_provider(&args[3], provider))?;
        if h < 1.0 {
            return None;
        }
        h as u32
    } else {
        range.rows()
    };
    let width = if args.len() == 5 {
        let w = coerce_to_number(&eval_expr_with_provider(&args[4], provider))?;
        if w < 1.0 {
            return None;
        }
        w as u32
    } else {
        range.cols()
    };
    let start_row = (anchor.row as i64).checked_add(row_off)?;
    let start_col = (anchor.col as i64).checked_add(col_off)?;
    if start_row < 0
        || start_col < 0
        || height == 0
        || width == 0
        || start_row.checked_add(height as i64)? > EXCEL_MAX_ROWS as i64
        || start_col.checked_add(width as i64)? > EXCEL_MAX_COLS as i64
    {
        return None;
    }
    let start = CellAddress::new(start_row as u32, start_col as u32);
    let end = CellAddress::new(start_row as u32 + height - 1, start_col as u32 + width - 1);
    Some(RuntimeRef {
        sheet: reference.sheet,
        range: CellRange::new(start, end),
        materialized: None,
    })
}
