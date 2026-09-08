//! 行高与列宽这类稀疏的行列尺寸事实。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    /// 批量尺寸只操作行列元数据；先完整校验，失败不会留下部分修改。
    pub fn resize_range(
        &mut self,
        range: CellRange,
        axis: &str,
        pixels: u32,
    ) -> Result<(), &'static str> {
        if range.start.row > range.end.row
            || range.start.col > range.end.col
            || range.end.row >= 1_048_576
            || range.end.col >= 16_384
        {
            return Err("Invalid size range.");
        }
        match axis {
            "row" if (16..=512).contains(&pixels) => {
                for row in range.start.row..=range.end.row {
                    self.set_row_height(row, pixels);
                }
            }
            "column" if (40..=1024).contains(&pixels) => {
                for col in range.start.col..=range.end.col {
                    self.set_col_width(col, pixels);
                }
            }
            "reset" if pixels == 0 => {
                // 清除只访问已存在的尺寸条目，不把空白单元格物化出来。
                for (row, _) in self.row_heights_in_range(range.start.row, range.end.row) {
                    self.clear_row_height(row);
                }
                for (col, _) in self.col_widths_in_range(range.start.col, range.end.col) {
                    self.clear_col_width(col);
                }
            }
            _ => return Err("Use a row height of 16–512 px or a column width of 40–1024 px."),
        }
        Ok(())
    }

    pub fn set_row_height(&mut self, row_index: u32, height_px: u32) -> bool {
        if height_px == 0 {
            return self.clear_row_height(row_index);
        }
        let style = self.row_styles.entry(row_index).or_default();
        let changed = style.height != Some(height_px);
        style.height = Some(height_px);
        changed
    }

    pub fn clear_row_height(&mut self, row_index: u32) -> bool {
        let Some(style) = self.row_styles.get_mut(&row_index) else {
            return false;
        };
        let changed = style.height.take().is_some();
        if style.is_empty() {
            self.row_styles.remove(&row_index);
        }
        changed
    }

    pub fn row_height(&self, row_index: u32) -> Option<u32> {
        self.row_styles
            .get(&row_index)
            .and_then(|style| style.height)
    }

    pub fn row_heights_in_range(&self, start_row: u32, end_row: u32) -> Vec<(u32, u32)> {
        if end_row < start_row {
            return Vec::new();
        }
        self.row_styles
            .range(start_row..=end_row)
            .filter_map(|(row_index, style)| style.height.map(|height| (*row_index, height)))
            .collect()
    }

    pub fn all_row_heights(&self) -> Vec<(u32, u32)> {
        self.row_styles
            .iter()
            .filter_map(|(row_index, style)| style.height.map(|height| (*row_index, height)))
            .collect()
    }

    pub fn set_col_width(&mut self, col_index: u32, width_px: u32) -> bool {
        if width_px == 0 {
            return self.clear_col_width(col_index);
        }
        self.interior
            .col_widths
            .borrow_mut()
            .insert(col_index, width_px)
            != Some(width_px)
    }

    pub fn clear_col_width(&mut self, col_index: u32) -> bool {
        self.interior
            .col_widths
            .borrow_mut()
            .remove(&col_index)
            .is_some()
    }

    pub fn col_width(&self, col_index: u32) -> Option<u32> {
        self.interior.col_widths.borrow().get(&col_index).copied()
    }

    pub fn col_widths_in_range(&self, start_col: u32, end_col: u32) -> Vec<(u32, u32)> {
        if end_col < start_col {
            return Vec::new();
        }
        self.interior
            .col_widths
            .borrow()
            .range(start_col..=end_col)
            .map(|(col_index, width_px)| (*col_index, *width_px))
            .collect()
    }

    pub fn all_col_widths(&self) -> Vec<(u32, u32)> {
        self.interior
            .col_widths
            .borrow()
            .iter()
            .map(|(col_index, width_px)| (*col_index, *width_px))
            .collect()
    }

    pub(super) fn shift_dimension_insert<T: Clone>(
        dimensions: &mut BTreeMap<u32, T>,
        at: u32,
        count: u32,
    ) {
        let mut shifted = BTreeMap::new();
        for (index, size_px) in dimensions.iter() {
            let next_index = if *index >= at {
                index.saturating_add(count)
            } else {
                *index
            };
            shifted.insert(next_index, size_px.clone());
        }
        *dimensions = shifted;
    }

    pub(super) fn shift_dimension_delete<T: Clone>(
        dimensions: &mut BTreeMap<u32, T>,
        at: u32,
        count: u32,
    ) {
        let delete_end = at.saturating_add(count);
        let mut shifted = BTreeMap::new();
        for (index, size_px) in dimensions.iter() {
            if *index >= at && *index < delete_end {
                continue;
            }
            let next_index = if *index >= delete_end {
                index.saturating_sub(count)
            } else {
                *index
            };
            shifted.insert(next_index, size_px.clone());
        }
        *dimensions = shifted;
    }
}
