//! Sparse materialization for lookup-function range arguments.
//!
//! Whole-axis references use a sentinel end coordinate.  The generic grid
//! materializer deliberately rejects those ranges so dynamic arrays never
//! allocate a worksheet-sized rectangle.  Lookup functions instead need the
//! populated prefix plus its implicit blanks, which the workbook provider can
//! obtain by walking its sparse range index.

use super::*;

struct SparseLookupRange {
    start: CellAddress,
    rows: u32,
    cols: u32,
    cells: Vec<(CellAddress, Value)>,
}

pub(super) fn collect_lookup_range_2d_for_arg(
    arg: &Expr,
    provider: &dyn EvalProvider,
) -> Option<Vec<Vec<Value>>> {
    let reference = runtime_ref_from_expr(arg, provider).ok()?;
    if !has_whole_axis(&reference) {
        return runtime_ref_to_grid(&reference, provider);
    }
    let sparse = collect_sparse_lookup_range(&reference, provider)?;
    Some(materialize_lookup_range(&sparse, sparse.rows, sparse.cols))
}

pub(super) fn collect_lookup_range_pair_2d_for_args(
    lookup_arg: &Expr,
    return_arg: &Expr,
    provider: &dyn EvalProvider,
) -> Option<(Vec<Vec<Value>>, Vec<Vec<Value>>)> {
    let lookup_ref = runtime_ref_from_expr(lookup_arg, provider).ok()?;
    let return_ref = runtime_ref_from_expr(return_arg, provider).ok()?;
    if !has_whole_axis(&lookup_ref) && !has_whole_axis(&return_ref)
        || lookup_ref.bounded_shape() != return_ref.bounded_shape()
    {
        return Some((
            runtime_ref_to_grid(&lookup_ref, provider)?,
            runtime_ref_to_grid(&return_ref, provider)?,
        ));
    }

    let lookup = collect_sparse_lookup_range(&lookup_ref, provider)?;
    let returned = collect_sparse_lookup_range(&return_ref, provider)?;
    let rows = lookup.rows.max(returned.rows);
    let cols = lookup.cols.max(returned.cols);
    Some((
        materialize_lookup_range(&lookup, rows, cols),
        materialize_lookup_range(&returned, rows, cols),
    ))
}

fn has_whole_axis(reference: &RuntimeRef) -> bool {
    let range = reference.normalized();
    reference.materialized.is_none()
        && (range.end.row > EXCEL_MAX_ROWS || range.end.col > EXCEL_MAX_COLS)
}

fn collect_sparse_lookup_range(
    reference: &RuntimeRef,
    provider: &dyn EvalProvider,
) -> Option<SparseLookupRange> {
    let range = reference.normalized();
    let row_is_unbounded = range.end.row > EXCEL_MAX_ROWS;
    let col_is_unbounded = range.end.col > EXCEL_MAX_COLS;
    let valid_end_row = if row_is_unbounded {
        EXCEL_MAX_ROWS.checked_sub(1)?
    } else {
        range.end.row
    };
    let valid_end_col = if col_is_unbounded {
        EXCEL_MAX_COLS.checked_sub(1)?
    } else {
        range.end.col
    };
    if valid_end_row < range.start.row || valid_end_col < range.start.col {
        return None;
    }

    let mut end_row = if row_is_unbounded {
        range.start.row
    } else {
        valid_end_row
    };
    let mut end_col = if col_is_unbounded {
        range.start.col
    } else {
        valid_end_col
    };
    let mut cells = Vec::new();
    let mut visit = |addr: CellAddress, value: Value| {
        if addr.row < range.start.row
            || addr.row > valid_end_row
            || addr.col < range.start.col
            || addr.col > valid_end_col
        {
            return;
        }
        if row_is_unbounded {
            end_row = end_row.max(addr.row);
        }
        if col_is_unbounded {
            end_col = end_col.max(addr.col);
        }
        cells.push((addr, value));
    };
    match &reference.sheet {
        Some(sheet) => provider.for_each_sheet_range_cell(sheet, reference.range, &mut visit),
        None => provider.for_each_range_cell(reference.range, &mut visit),
    }

    Some(SparseLookupRange {
        start: range.start,
        rows: end_row - range.start.row + 1,
        cols: end_col - range.start.col + 1,
        cells,
    })
}

fn materialize_lookup_range(sparse: &SparseLookupRange, rows: u32, cols: u32) -> Vec<Vec<Value>> {
    if checked_array_len(rows as u64, cols as u64).is_err() {
        return vec![];
    }
    let mut grid = (0..rows)
        .map(|_| vec![Value::Null; cols as usize])
        .collect::<Vec<_>>();
    for (addr, value) in &sparse.cells {
        let row = (addr.row - sparse.start.row) as usize;
        let col = (addr.col - sparse.start.col) as usize;
        if row < rows as usize && col < cols as usize {
            grid[row][col] = value.clone();
        }
    }
    grid
}
