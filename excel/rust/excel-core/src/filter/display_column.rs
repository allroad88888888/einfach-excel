//! Displayed color facts shared by filter predicates and candidate browsing.

use crate::display_color::{effective_color, visit_font_colors, DisplayColor, DisplayColorSource};
use crate::display_column::DisplayColumn;
use crate::sheet::collapse_array_for_eval;
use crate::{CellAddress, DisplayFormatRangeSnapshot, Sheet};

pub(crate) struct FilterDisplayColumn<'a> {
    sheet: &'a Sheet,
    column: u32,
    display: DisplayColumn<'a>,
}

impl<'a> FilterDisplayColumn<'a> {
    pub(crate) fn new(sheet: &'a Sheet, snapshot: &'a DisplayFormatRangeSnapshot) -> Self {
        Self {
            sheet,
            column: snapshot.formats.range.start.col,
            display: DisplayColumn::new(snapshot),
        }
    }

    pub(crate) fn visit_colors(
        &self,
        row: u32,
        source: DisplayColorSource,
        mut visit: impl FnMut(DisplayColor),
    ) {
        let address = CellAddress::new(row, self.column);
        let cell_color = effective_color(
            self.display.layers_at(row),
            source,
            source == DisplayColorSource::Font && self.display.has_conditional_font_at(row),
            || collapse_array_for_eval(self.sheet.peek_value(address)),
        );
        match source {
            DisplayColorSource::Fill => visit(cell_color),
            DisplayColorSource::Font => visit_font_colors(cell_color, self.sheet.rich_text(address), visit),
        }
    }
}
