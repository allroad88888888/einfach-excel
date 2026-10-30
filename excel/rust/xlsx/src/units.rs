//! Excel 尺寸单位与屏幕像素互转（按默认 Calibri 11，最大数字宽 7px）。

const MAX_DIGIT_WIDTH: f64 = 7.0;
/// 引擎接受的范围，与 UI 的行高/列宽拖拽上下限一致。
const MIN_COLUMN_PX: u32 = 40;
const MAX_COLUMN_PX: u32 = 1024;
const MIN_ROW_PX: u32 = 16;
const MAX_ROW_PX: u32 = 512;

/// `<col width>`（字符数，含 5px 边距）→ 像素。
pub fn column_width_to_px(width: f64) -> u32 {
    let px = (width * MAX_DIGIT_WIDTH + 5.0).round();
    (px.max(0.0) as u32).clamp(MIN_COLUMN_PX, MAX_COLUMN_PX)
}

pub fn px_to_column_width(px: u32) -> f64 {
    let width = (f64::from(px) - 5.0) / MAX_DIGIT_WIDTH;
    (width.max(0.0) * 256.0).round() / 256.0
}

/// `<row ht>`（磅）→ 像素。
pub fn row_height_to_px(points: f64) -> u32 {
    ((points * 96.0 / 72.0).round().max(0.0) as u32).clamp(MIN_ROW_PX, MAX_ROW_PX)
}

pub fn px_to_row_height(px: u32) -> f64 {
    (f64::from(px) * 72.0 / 96.0 * 100.0).round() / 100.0
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_excel_sizes_map_to_familiar_pixels() {
        assert_eq!(column_width_to_px(8.43), 64);
        assert_eq!(row_height_to_px(15.0), 20);
        assert_eq!(column_width_to_px(px_to_column_width(150)), 150);
        assert_eq!(row_height_to_px(px_to_row_height(40)), 40);
        assert_eq!(column_width_to_px(0.5), 40);
    }
}
