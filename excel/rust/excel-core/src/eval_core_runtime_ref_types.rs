use super::*;

/// Normalized rectangle resolved from a range-shaped argument expression.
/// Used by the multi-criteria aggregates (COUNTIFS / SUMIFS / AVERAGEIF /
/// AVERAGEIFS / MAXIFS / MINIFS) where every range has to share the same
/// (rows, cols) shape. `sheet` is `Some` only for cross-sheet ranges.
#[derive(Clone)]
pub(super) struct ResolvedRange {
    pub(super) sheet: Option<String>,
    pub(super) start_row: u32,
    pub(super) start_col: u32,
    pub(super) rows: u32,
    pub(super) cols: u32,
    pub(super) materialized: Option<Arc<ArrayData>>,
}

#[derive(Clone)]
pub(super) struct RuntimeRef {
    pub(super) sheet: Option<String>,
    pub(super) range: CellRange,
    pub(super) materialized: Option<Arc<ArrayData>>,
}

impl RuntimeRef {
    pub(super) fn normalized(&self) -> CellRange {
        self.range.normalize()
    }

    pub(super) fn materialized_shape(&self) -> Option<(u32, u32)> {
        self.materialized.as_ref().map(|arr| arr.shape())
    }

    pub(super) fn bounded_shape(&self) -> Option<(u32, u32)> {
        if let Some(shape) = self.materialized_shape() {
            return Some(shape);
        }
        let n = self.normalized();
        let end_row = if n.end.row > EXCEL_MAX_ROWS {
            EXCEL_MAX_ROWS.checked_sub(1)?
        } else {
            n.end.row
        };
        let end_col = if n.end.col > EXCEL_MAX_COLS {
            EXCEL_MAX_COLS.checked_sub(1)?
        } else {
            n.end.col
        };
        if end_row < n.start.row || end_col < n.start.col {
            return None;
        }
        Some((end_row - n.start.row + 1, end_col - n.start.col + 1))
    }

    pub(super) fn slice(&self, row_offset: u32, rows: u32, col_offset: u32, cols: u32) -> Option<RuntimeRef> {
        if rows == 0 || cols == 0 {
            return None;
        }
        let (src_rows, src_cols) = self.bounded_shape()?;
        if row_offset.checked_add(rows)? > src_rows || col_offset.checked_add(cols)? > src_cols {
            return None;
        }
        let cap = checked_array_len(rows as u64, cols as u64).ok()?;
        let n = self.normalized();
        let start = CellAddress::new(
            n.start.row.checked_add(row_offset)?,
            n.start.col.checked_add(col_offset)?,
        );
        let end = CellAddress::new(
            start.row.checked_add(rows - 1)?,
            start.col.checked_add(cols - 1)?,
        );
        let materialized = self.materialized.as_ref().map(|arr| {
            let mut data = Vec::with_capacity(cap);
            for r in 0..rows {
                for c in 0..cols {
                    data.push(
                        arr.get(row_offset + r, col_offset + c)
                            .cloned()
                            .unwrap_or(Value::Null),
                    );
                }
            }
            Arc::new(ArrayData::new(rows, cols, data))
        });
        Some(RuntimeRef {
            sheet: self.sheet.clone(),
            range: CellRange::new(start, end),
            materialized,
        })
    }
}
