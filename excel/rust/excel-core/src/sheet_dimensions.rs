//! 行高与列宽这类稀疏的行列尺寸事实。
//!
//! 拆自 `sheet.rs`，是 `sheet` 的子模块 —— 照旧看得见 `Sheet` 的私有字段与私有
//! 方法。原来的私有项在这里写成 `pub(super)`，覆盖范围与它们留在 `sheet.rs`
//! 里时逐字相同。

use super::*;

impl Sheet {
    pub fn set_row_height(&mut self, row_index: u32, height_px: u32) -> bool {
        if height_px == 0 {
            return self.clear_row_height(row_index);
        }
        self.row_heights.insert(row_index, height_px) != Some(height_px)
    }

    pub fn clear_row_height(&mut self, row_index: u32) -> bool {
        self.row_heights.remove(&row_index).is_some()
    }

    pub fn row_height(&self, row_index: u32) -> Option<u32> {
        self.row_heights.get(&row_index).copied()
    }

    pub fn row_heights_in_range(&self, start_row: u32, end_row: u32) -> Vec<(u32, u32)> {
        if end_row < start_row {
            return Vec::new();
        }
        self.row_heights
            .range(start_row..=end_row)
            .map(|(row_index, height_px)| (*row_index, *height_px))
            .collect()
    }

    pub fn all_row_heights(&self) -> Vec<(u32, u32)> {
        self.row_heights
            .iter()
            .map(|(row_index, height_px)| (*row_index, *height_px))
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

    pub(super) fn shift_dimension_insert(dimensions: &mut BTreeMap<u32, u32>, at: u32, count: u32) {
        let mut shifted = BTreeMap::new();
        for (index, size_px) in dimensions.iter() {
            let next_index = if *index >= at {
                index.saturating_add(count)
            } else {
                *index
            };
            shifted.insert(next_index, *size_px);
        }
        *dimensions = shifted;
    }

    pub(super) fn shift_dimension_delete(dimensions: &mut BTreeMap<u32, u32>, at: u32, count: u32) {
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
            shifted.insert(next_index, *size_px);
        }
        *dimensions = shifted;
    }
}
