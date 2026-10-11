//! Table 样式只在所读窗口中展开，手动格/行/列格式继续覆盖这些默认值。
use super::*;
use crate::{CellStyle, FormatRangeSnapshot, TableStylePreset};

impl Workbook {
    pub(crate) fn table_base_style_at(&self, sheet: usize, addr: CellAddress) -> Option<CellStyle> {
        let name = self.name(sheet)?;
        let table = self.tables.values().find(|table|
            table.sheet_name() == name && table.range().contains(addr)
                && table.style().preset != TableStylePreset::None)?;
        let mut style = table.style().cell_style(table, addr);
        self.sheets[sheet].apply_base_style_at(addr, &mut style);
        Some(style)
    }

    pub(super) fn project_table_styles(&self, sheet: usize, snapshot: &mut FormatRangeSnapshot) {
        let name = self.names[sheet].as_str();
        let range = snapshot.range;
        let tables: Vec<_> = self.tables.values().filter(|table|
            table.sheet_name() == name && table.range().intersects(range)
                && table.style().preset != TableStylePreset::None).collect();
        if tables.is_empty() { return; }
        let mut styles: BTreeMap<_, _> = std::mem::take(&mut snapshot.cell_styles).into_iter()
            .map(|(addr, style)| ((addr.row, addr.col), style)).collect();
        for table in tables {
            let bounds = table.range();
            for row in range.start.row.max(bounds.start.row)..=range.end.row.min(bounds.end.row) {
                for col in range.start.col.max(bounds.start.col)..=range.end.col.min(bounds.end.col) {
                    let addr = CellAddress::new(row, col);
                    let mut style = table.style().cell_style(table, addr);
                    self.sheets[sheet].apply_base_style_at(addr, &mut style);
                    styles.insert((row, col), style);
                }
            }
        }
        snapshot.cell_styles = styles.into_iter()
            .map(|((row, col), style)| (CellAddress::new(row, col), style)).collect();
    }
}
