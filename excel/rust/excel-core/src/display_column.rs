//! One-column reads from an already prepared workbook display snapshot.

use crate::{CellStyle, ConditionalIconDisplay, DisplayFormatRangeSnapshot};

pub(crate) struct DisplayColumn<'a> {
    display: &'a DisplayFormatRangeSnapshot,
}

impl<'a> DisplayColumn<'a> {
    pub(crate) fn new(display: &'a DisplayFormatRangeSnapshot) -> Self {
        debug_assert_eq!(display.formats.range.start.col, display.formats.range.end.col);
        Self { display }
    }

    /// The order is most-to-least specific so explicit clears block lower layers.
    pub(crate) fn layers_at(&self, row: u32) -> [Option<&'a CellStyle>; 3] {
        let snapshot = &self.display.formats;
        let column = snapshot.column_styles.first().map(|(_, style)| style);
        let row_style = snapshot.row_styles.binary_search_by_key(&row, |(i, _)| *i)
            .ok().map(|i| &snapshot.row_styles[i].1.format);
        let cell_style = snapshot.cell_styles.binary_search_by_key(&row, |(address, _)| address.row)
            .ok().map(|i| &snapshot.cell_styles[i].1);
        [cell_style, row_style, column]
    }

    pub(crate) fn has_conditional_font_at(&self, row: u32) -> bool {
        self.display.conditional_font_colors.binary_search_by_key(&row, |a| a.row).is_ok()
    }

    pub(crate) fn icon_at(&self, row: u32) -> Option<&'a ConditionalIconDisplay> {
        self.display.conditional_icons.binary_search_by_key(&row, |(addr, _)| addr.row).ok()
            .map(|i| &self.display.conditional_icons[i].1)
    }
}
