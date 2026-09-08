//! 自动适应只汇总稀疏内容；文字的像素测量由显示环境提供，尺寸事实仍由 Rust 写入。
use crate::{CellFormat, CellRange, Workbook};
use einfach_core::Value;
use std::collections::{BTreeMap, HashSet};

impl Workbook {
    /// 全部测量成功后才修改行列属性，测量失败不会留下半列／半行的新尺寸。
    /// 跨被调整轴的合并格保留原尺寸；隐藏轴既不参与测量，也不被自动取消隐藏。
    pub fn auto_fit_dimensions(
        &mut self,
        sheet_index: usize,
        range: CellRange,
        axis: &str,
        default_row: u32,
        default_col: u32,
        mut measure: impl FnMut(&Value, &CellFormat, f64) -> Result<f64, String>,
    ) -> Result<bool, String> {
        if !matches!(axis, "row" | "column")
            || !(16..=512).contains(&default_row)
            || !(40..=1024).contains(&default_col)
            || range.start.row > range.end.row || range.start.col > range.end.col
            || range.end.row >= 1_048_576 || range.end.col >= 16_384
        {
            return Err("Invalid auto-fit range, axis or default sizes.".into());
        }
        let sheet = self.sheet(sheet_index).ok_or("The worksheet no longer exists.")?;
        let rows = axis == "row";
        let fallback = if rows { default_row } else { default_col };
        let hidden_rows: HashSet<_> = sheet.hidden_rows().into_iter()
            .chain(sheet.filter_hidden_rows()).collect();
        let hidden_cols: HashSet<_> = sheet.hidden_columns().into_iter().collect();
        let blocked = |index| sheet.merged_ranges().iter().any(|merge| {
            if rows {
                merge.start.row != merge.end.row && index >= merge.start.row && index <= merge.end.row
            } else {
                merge.start.col != merge.end.col && index >= merge.start.col && index <= merge.end.col
            }
        });
        // 空行列只重置已存在的尺寸；整张空表不会产生百万个默认尺寸条目。
        let old_sizes = if rows {
            sheet.row_heights_in_range(range.start.row, range.end.row)
        } else {
            sheet.col_widths_in_range(range.start.col, range.end.col)
        };
        let mut plan: BTreeMap<u32, u32> = old_sizes.into_iter()
            .filter(|(index, _)| !blocked(*index) &&
                !(if rows { &hidden_rows } else { &hidden_cols }).contains(index))
            .map(|(index, _)| (index, fallback)).collect();
        let mut measured = HashSet::new();
        let mut error = None;
        self.for_each_sparse_range_cell(sheet_index, range, |addr, value| {
            if error.is_some() || hidden_rows.contains(&addr.row) || hidden_cols.contains(&addr.col)
                || matches!(&value, Value::Null)
                || matches!(&value, Value::Text(s) if s.is_empty()) { return; }
            let index = if rows { addr.row } else { addr.col };
            if blocked(index) { return; }
            let merge = sheet.merged_range_at(addr);
            if merge.is_some_and(|m| m.start != addr) { return; }
            let (start_col, end_col) = merge.map(|m| (m.start.col, m.end.col))
                .unwrap_or((addr.col, addr.col));
            let width: f64 = (start_col..=end_col).filter(|c| !hidden_cols.contains(c))
                .map(|col| f64::from(sheet.col_width(col).unwrap_or(default_col))).sum();
            let format = sheet.effective_format(&addr.to_string());
            match measure(&value, &format, width) {
                Ok(pixels) if pixels.is_finite() && pixels >= 0.0 => {
                    let (min, max) = if rows { (16.0, 512.0) } else { (40.0, 1024.0) };
                    let pixels = pixels.ceil().clamp(min, max) as u32;
                    if measured.insert(index) { plan.insert(index, pixels); }
                    else { plan.entry(index).and_modify(|size| *size = (*size).max(pixels)); }
                }
                Ok(_) => error = Some("Text measurement returned an invalid size.".into()),
                Err(message) => error = Some(message),
            }
        });
        if let Some(error) = error { return Err(error); }
        let sheet = self.sheet_mut(sheet_index).ok_or("The worksheet no longer exists.")?;
        let mut changed = false;
        for (index, pixels) in plan {
            changed |= match (rows, pixels == fallback) {
                (true, true) => sheet.clear_row_height(index),
                (true, false) => sheet.set_row_height(index, pixels),
                (false, true) => sheet.clear_col_width(index),
                (false, false) => sheet.set_col_width(index, pixels),
            };
        }
        Ok(changed)
    }
}
