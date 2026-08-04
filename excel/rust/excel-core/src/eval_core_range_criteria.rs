use super::*;

/// Resolve a function-argument expression to a normalized range. Accepts
/// `Expr::Range`, `Expr::SheetRange`, and `OFFSET(...)`. Anything else
/// returns `Ok(None)` — the caller surfaces `InvalidValue` to keep parity
/// with Excel's `#VALUE!`. A syntactic cross-sheet reference whose sheet is
/// absent is different: returning `Err(InvalidRef)` makes every caller
/// propagate Excel's `#REF!` even when sparse candidate selection reads no
/// cells from that range.
pub(super) fn resolve_range_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Result<Option<ResolvedRange>, ValueError> {
    let r = match runtime_ref_from_expr(arg, provider) {
        Ok(r) => r,
        Err(ValueError::InvalidRef) => return Err(ValueError::InvalidRef),
        Err(_) => return Ok(None),
    };
    if let Some(sheet) = &r.sheet {
        if provider.sheet_index_of(sheet).is_none() {
            return Err(ValueError::InvalidRef);
        }
    }
    let n = r.normalized();
    let Some((rows, cols)) = r.bounded_shape() else {
        return Ok(None);
    };
    Ok(Some(ResolvedRange {
        sheet: r.sheet,
        start_row: n.start.row,
        start_col: n.start.col,
        rows,
        cols,
        materialized: r.materialized,
    }))
}

/// Look up a single cell within a `ResolvedRange` by (dr, dc) offset.
pub(super) fn fetch_range_cell(
    range: &ResolvedRange,
    dr: u32,
    dc: u32,
    provider: &dyn EvalProvider,
) -> Value {
    if let Some(arr) = &range.materialized {
        return arr.get(dr, dc).cloned().unwrap_or(Value::Null);
    }
    let addr = CellAddress::new(range.start_row + dr, range.start_col + dc);
    match &range.sheet {
        Some(s) => provider.sheet_cell(s, addr),
        None => provider.cell(addr),
    }
}

/// Walk pairs of `(range_arg, criterion_arg)` from a slice of function
/// arguments. The slice's length must be even and ≥ 2 — callers should
/// arg-count check first. All ranges must share the shape of `args[0]`,
/// otherwise `InvalidValue` is returned. Criteria expressions are
/// evaluated once per call (outside the per-cell loop).
pub(super) fn collect_criteria_pairs(
    args: &[Expr],
    provider: &dyn EvalProvider,
) -> Result<Vec<(ResolvedRange, Value)>, ValueError> {
    if args.is_empty() || args.len() % 2 != 0 {
        return Err(ValueError::WrongArgCount);
    }
    let mut pairs: Vec<(ResolvedRange, Value)> = Vec::with_capacity(args.len() / 2);
    let mut shape: Option<(u32, u32)> = None;
    let mut i = 0;
    while i < args.len() {
        let range = match resolve_range_arg(&args[i], provider)? {
            Some(r) => r,
            None => return Err(ValueError::InvalidValue),
        };
        if let Some((rows, cols)) = shape {
            if range.rows != rows || range.cols != cols {
                return Err(ValueError::InvalidValue);
            }
        } else {
            shape = Some((range.rows, range.cols));
        }
        let criterion = eval_expr_with_provider(&args[i + 1], provider);
        // criteria 实参本身求值成错误 → 原样传播（普通实参错误规则）。不能落到
        // `matches_criterion`，否则会退化成「数显示文本等于 #REF! 的格子」。
        if let Value::Error(e) = criterion {
            return Err(e);
        }
        pairs.push((range, criterion));
        i += 2;
    }
    Ok(pairs)
}
