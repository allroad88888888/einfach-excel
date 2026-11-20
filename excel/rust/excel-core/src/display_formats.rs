//! Find the displayed layers and decorations for an address in a format snapshot.

use crate::{CellAddress, CellStyle, ConditionalIconDisplay, DisplayFormatRangeSnapshot};

pub(crate) struct DisplayFormats<'a> {
    display: &'a DisplayFormatRangeSnapshot,
}

impl<'a> DisplayFormats<'a> {
    pub(crate) fn new(display: &'a DisplayFormatRangeSnapshot) -> Self {
        Self { display }
    }

    /// Layers run from most to least specific, including explicit clears.
    pub(crate) fn layers_at(&self, address: CellAddress) -> [Option<&'a CellStyle>; 3] {
        let snapshot = &self.display.formats;
        let key = (address.row, address.col);
        let cell = snapshot.cell_styles.binary_search_by_key(&key, |(a, _)| (a.row, a.col))
            .ok().map(|i| &snapshot.cell_styles[i].1);
        let row = snapshot.row_styles.binary_search_by_key(&address.row, |(idx, _)| *idx)
            .ok().map(|i| &snapshot.row_styles[i].1.format);
        let column = snapshot.column_styles.binary_search_by_key(&address.col, |(idx, _)| *idx)
            .ok().map(|i| &snapshot.column_styles[i].1);
        [cell, row, column]
    }

    pub(crate) fn has_conditional_font_at(&self, address: CellAddress) -> bool {
        self.display.conditional_font_colors
            .binary_search_by_key(&(address.row, address.col), |a| (a.row, a.col)).is_ok()
    }

    pub(crate) fn icon_at(&self, address: CellAddress) -> Option<&'a ConditionalIconDisplay> {
        self.display.conditional_icons
            .binary_search_by_key(&(address.row, address.col), |(a, _)| (a.row, a.col))
            .ok().map(|i| &self.display.conditional_icons[i].1)
    }
}
