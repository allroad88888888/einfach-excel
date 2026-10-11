//! Table 引用的唯一范围计算；求值与转换为普通区域共用，不读取单元格值。
use super::*;

impl ResolvedTable {
    pub(crate) fn reference_range(
        &self,
        area: TableArea,
        columns: Option<&(String, String)>,
        current: Option<CellAddress>,
    ) -> Result<CellRange, ValueError> {
        let full = self.range.normalize();
        let data_start = full.start.row + u32::from(self.has_headers);
        let data_end = full
            .end
            .row
            .checked_sub(u32::from(self.has_totals))
            .unwrap_or(full.start.row);
        let (row_start, row_end) = match area {
            TableArea::All => (full.start.row, full.end.row),
            TableArea::Headers if self.has_headers => (full.start.row, full.start.row),
            TableArea::Totals if self.has_totals => (full.end.row, full.end.row),
            TableArea::Headers | TableArea::Totals => return Err(ValueError::InvalidRef),
            TableArea::Data => {
                if data_end < data_start {
                    return Err(ValueError::InvalidRef);
                }
                (data_start, data_end)
            }
            TableArea::ThisRow => {
                let current = current.ok_or(ValueError::InvalidValue)?;
                if data_end < data_start || current.row < data_start || current.row > data_end {
                    return Err(ValueError::InvalidValue);
                }
                (current.row, current.row)
            }
        };
        let (col_start, col_end) = match columns {
            None => (full.start.col, full.end.col),
            Some((first, last)) => {
                let find = |name: &str| {
                    self.columns
                        .iter()
                        .position(|column| column.eq_ignore_ascii_case(name))
                        .map(|index| full.start.col + index as u32)
                        .ok_or(ValueError::InvalidRef)
                };
                let first = find(first)?;
                let last = find(last)?;
                (first.min(last), first.max(last))
            }
        };
        Ok(CellRange::new(
            CellAddress::new(row_start, col_start),
            CellAddress::new(row_end, col_end),
        ))
    }
}
