//! 双击填充的目标末行由原生稀疏地址决定；不求值公式，不创建格子 atom。
use super::*;

impl Workbook {
    /// 优先左邻列，左边没有贯穿样本并向下延续的数据时再看右邻列；首个空洞即结束。
    pub fn find_fill_down_end(
        &self,
        sheet_idx: usize,
        source: CellRange,
        row_limit: u32,
    ) -> Result<Option<u32>, AutoFillError> {
        if source != source.normalize()
            || source.end.col >= EXCEL_MAX_COLS
            || row_limit == 0
            || row_limit > EXCEL_MAX_ROWS
            || source.end.row >= row_limit
        {
            return Err(AutoFillError::InvalidGeometry(
                "invalid adjacent fill bounds",
            ));
        }
        let sheet = self
            .sheet(sheet_idx)
            .ok_or(AutoFillError::SheetOutOfRange)?;
        for col in [
            source.start.col.checked_sub(1),
            (source.end.col + 1 < EXCEL_MAX_COLS).then_some(source.end.col + 1),
        ]
        .into_iter()
        .flatten()
        {
            let mut rows = Vec::new();
            sheet.for_each_non_empty_in_range(
                CellRange::new(
                    CellAddress::new(source.start.row, col),
                    CellAddress::new(row_limit - 1, col),
                ),
                |addr| rows.push(addr.row),
            );
            rows.sort_unstable();
            let mut next = source.start.row;
            for row in rows {
                if row != next {
                    break;
                }
                next += 1;
            }
            if next > source.end.row + 1 {
                return Ok(Some(next - 1));
            }
        }
        Ok(None)
    }
}
