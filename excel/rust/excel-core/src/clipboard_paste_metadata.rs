//! 选择性粘贴「仅备注」「仅数据验证」：只改单元格附属数据，各是一步原生撤销。
use super::*;
use crate::data_validation::{DataValidationKind, DataValidationRegion, DataValidationRule};
use std::sync::Arc;
use crate::workbook_history::WorkbookHistory;

impl ClipboardSnapshot {
    /// 目标格对应的源格在 cells / notes 中的下标；目标按源尺寸整份平铺。
    fn tiled_index(&self, target: CellRange, addr: CellAddress) -> usize {
        let row = (addr.row - target.start.row) % self.rows();
        let col = (addr.col - target.start.col) % self.cols();
        (row * self.cols() + col) as usize
    }
}

impl Workbook {
    /// 只写源里有备注的格，目标其它格的备注保持不变；合并区只写锚点。
    pub(super) fn paste_notes(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        range: CellRange,
        mut history: Option<&mut WorkbookHistory>,
    ) -> Result<CellRange, ClipboardError> {
        if let Some(history) = history.as_deref_mut() {
            history.begin(self, sheet_idx, range, "Paste notes", false)?;
        }
        let sheet = self.sheet_mut(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let mut result = Ok(());
        for addr in range.iter() {
            let Some(Some(text)) = snapshot.notes.get(snapshot.tiled_index(range, addr)) else {
                continue;
            };
            if sheet.merged_range_at(addr).is_some_and(|merge| merge.start != addr) {
                continue;
            }
            if let Err(error) = sheet.set_note(addr, Some(text)) {
                result = Err(error);
                break;
            }
        }
        if let Some(history) = history {
            history.finish(self, result.is_ok())?;
        }
        result.map(|()| range)
    }

    /// 目标区域的验证整体换成源的验证块；源里没有验证的格清除验证。
    /// 自定义公式随块平移改写，与插入/移动单元格同一套锚点规则。
    pub(super) fn paste_validations(
        &mut self,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        range: CellRange,
        history: Option<&mut WorkbookHistory>,
    ) -> Result<CellRange, ClipboardError> {
        if snapshot.source_rows.len() != snapshot.source.rows() as usize
            || snapshot.source_cols.len() != snapshot.source.cols() as usize
        {
            return Err("CLIPBOARD_VALIDATION_BLOCKS");
        }
        let (rows, cols) = (snapshot.rows(), snapshot.cols());
        let mut pieces = Vec::new();
        for tile_row in 0..range.rows() / rows {
            for tile_col in 0..range.cols() / cols {
                let delta = (
                    i64::from(range.start.row + tile_row * rows) - i64::from(snapshot.source.start.row),
                    i64::from(range.start.col + tile_col * cols) - i64::from(snapshot.source.start.col),
                );
                for region in &snapshot.validations {
                    let moved = |addr: CellAddress| CellAddress::new(
                        (i64::from(addr.row) + delta.0) as u32,
                        (i64::from(addr.col) + delta.1) as u32,
                    );
                    pieces.push(DataValidationRegion {
                        range: CellRange::new(moved(region.range.start), moved(region.range.end)),
                        rule: copied_rule(&region.rule, region.range, delta)?,
                    });
                }
            }
        }
        match history {
            Some(history) => history.replace_data_validations(self, sheet_idx, range, pieces)?,
            None => {
                self.ensure_sheet_unprotected(sheet_idx)?;
                let sheet = self.sheet_mut(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
                sheet.replace_data_validations(range, &pieces)?;
            }
        }
        Ok(range)
    }
}

/// 复制语义：自定义公式的相对引用随粘贴位置平移（同复制公式），锚点放到目标块起点。
/// 平移越出画布时拒绝，不把引用悄悄改成别的格。
fn copied_rule(
    rule: &Arc<DataValidationRule>,
    before: CellRange,
    delta: (i64, i64),
) -> Result<Arc<DataValidationRule>, ClipboardError> {
    let DataValidationKind::CustomFormula { formula, anchor } = &rule.kind else {
        return Ok(rule.clone());
    };
    let expr = crate::parse_formula(formula).ok_or("CLIPBOARD_INVALID_FORMULA")?;
    let rows = i64::from(before.start.row) - i64::from(anchor.row) + delta.0;
    let cols = i64::from(before.start.col) - i64::from(anchor.col) + delta.1;
    let shifted = crate::shift::shift_copy_formula(&expr, rows, cols)
        .map_err(|()| "CLIPBOARD_VALIDATION_REFERENCE")?;
    let start = CellAddress::new(
        (i64::from(before.start.row) + delta.0) as u32,
        (i64::from(before.start.col) + delta.1) as u32,
    );
    let kind = DataValidationKind::CustomFormula { formula: crate::render_formula(&shifted), anchor: start };
    Ok(Arc::new(DataValidationRule { kind, ..(**rule).clone() }))
}

/// 复制时与源矩形相交的验证块，裁剪到源矩形内。
pub(super) fn captured_validations(sheet: &crate::Sheet, source: CellRange) -> Vec<DataValidationRegion> {
    sheet.data_validations().iter().filter(|region| region.range.intersects(source)).map(|region| {
        let start = CellAddress::new(region.range.start.row.max(source.start.row),
            region.range.start.col.max(source.start.col));
        let end = CellAddress::new(region.range.end.row.min(source.end.row),
            region.range.end.col.min(source.end.col));
        DataValidationRegion { range: CellRange::new(start, end), rule: region.rule.clone() }
    }).collect()
}
