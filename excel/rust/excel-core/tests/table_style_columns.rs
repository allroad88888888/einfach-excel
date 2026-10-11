//! 列样式由当前 Table 几何派生，不向真实单元格写入格式。
use einfach_core::Value;
use einfach_excel_core::cell_style::StyleScope;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, TableStyle, TableStylePreset, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    for (address, text) in [("C3", "Item"), ("D3", "Quantity"), ("E3", "Amount")] {
        wb.set_cell(0, address, Value::Text(text.into()));
    }
    wb.define_table(Some("Orders"), 0, range("C3", "E6"), true).unwrap();
    (wb, WorkbookHistory::default())
}
fn style() -> TableStyle {
    TableStyle { preset: TableStylePreset::Blue, banded_rows: false,
        banded_columns: true, last_column: true, ..Default::default() }
}
fn display(wb: &Workbook, addr: &str) -> CellStyle {
    wb.snapshot_display_format_range(0, range(addr, addr)).unwrap().formats
        .cell_styles.into_iter().next().map(|(_, style)| style).unwrap_or_default()
}

#[test]
fn column_stripes_anchor_to_table_and_edge_emphasis_tracks_last_column() {
    let (mut wb, mut history) = seed();
    let raw = wb.sheet(0).unwrap().snapshot_format_range(range("C3", "F7"));
    history.set_table_style(&mut wb, "Orders", style()).unwrap();
    for row in [4, 5, 6] {
        for (col, color, bold) in [("C", "#d9e8f5", false),
            ("D", "#ffffff", false), ("E", "#d9e8f5", true)] {
            let cell = display(&wb, &format!("{col}{row}"));
            assert_eq!(cell.background.flatten().as_deref(), Some(color));
            assert_eq!(cell.bold, Some(bold));
        }
    }
    assert_eq!(display(&wb, "D3").background.flatten().as_deref(), Some("#1f4e78"));
    assert_eq!(wb.sheet(0).unwrap().snapshot_format_range(range("C3", "F7")), raw);
    history.resize_table(&mut wb, "Orders", range("C3", "F6")).unwrap();
    assert_eq!(display(&wb, "E4").bold, Some(false));
    assert_eq!(display(&wb, "F4").bold, Some(true));
    assert_eq!(display(&wb, "F4").background.flatten().as_deref(), Some("#ffffff"));
    history.undo(&mut wb).unwrap();
    assert_eq!(display(&wb, "E4").bold, Some(true));
    history.undo(&mut wb).unwrap();
    assert_eq!(display(&wb, "E4"), CellStyle::default());
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_table("Orders").unwrap().style(), style());
}

#[test]
fn row_and_column_bands_combine_but_explicit_formats_still_win() {
    let (mut wb, mut history) = seed();
    history.set_table_style(&mut wb, "Orders", TableStyle { banded_rows: true,
        first_column: true, ..style() }).unwrap();
    for addr in ["C4", "D4", "E4", "C5", "E5"] {
        assert_eq!(display(&wb, addr).background.flatten().as_deref(), Some("#d9e8f5"));
    }
    assert_eq!(display(&wb, "D5").background.flatten().as_deref(), Some("#ffffff"));
    assert_eq!(display(&wb, "C5").bold, Some(true));
    wb.sheet_mut(0).unwrap().patch_format_range(range("E4", "E4"), StyleScope::Cell,
        CellStyle { bold: Some(false), background: Some(Some("#123456".into())),
            ..Default::default() });
    assert_eq!(display(&wb, "E4").bold, Some(false));
    assert_eq!(display(&wb, "E4").background.flatten().as_deref(), Some("#123456"));
    history.set_table_totals_row(&mut wb, "Orders", true).unwrap();
    assert_eq!(display(&wb, "D7").bold, Some(true));
    assert_eq!(display(&wb, "D7").background.flatten().as_deref(), Some("#d9e8f5"));
}

#[test]
fn column_flags_round_trip_and_old_style_objects_default_to_disabled() {
    let old = serde_json::json!({"preset":"blue", "bandedRows":false, "firstColumn":false});
    let decoded: TableStyle = serde_json::from_value(old.clone()).unwrap();
    assert!(!decoded.banded_columns && !decoded.last_column);
    let current = serde_json::to_value(style()).unwrap();
    assert_eq!(current["bandedColumns"], true);
    assert_eq!(current["lastColumn"], true);
    assert_eq!(serde_json::from_value::<TableStyle>(current).unwrap(), style());
    for key in ["bandedColumns", "lastColumn"] {
        for value in [serde_json::json!(1), serde_json::json!(null), serde_json::json!("true")] {
            let mut invalid = old.clone();
            invalid[key] = value;
            assert!(serde_json::from_value::<TableStyle>(invalid).is_err());
        }
    }
}
