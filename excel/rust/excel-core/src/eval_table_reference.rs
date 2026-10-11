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
        // 使用右开边界：汇总独占第 0 行时数据区为空，不能把下溢兜底为第 0 行。
        let data_end = full.end.row + 1 - u32::from(self.has_totals);
        let (row_start, row_end) = match area {
            TableArea::All => (full.start.row, full.end.row),
            // 隐藏表头仍验证列身份并提供一行的形状；调用方必须物化为零，不能读数据首行。
            TableArea::Headers => (full.start.row, full.start.row),
            TableArea::Totals if self.has_totals => (full.end.row, full.end.row),
            TableArea::Totals => return Err(ValueError::InvalidRef),
            TableArea::Data => {
                if self.insert_row || data_end <= data_start {
                    return Err(ValueError::InvalidRef);
                }
                (data_start, data_end - 1)
            }
            TableArea::ThisRow => {
                let current = current.ok_or(ValueError::InvalidValue)?;
                if self.insert_row || current.row < data_start || current.row >= data_end {
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
