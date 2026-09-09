use einfach_core::{Value, ValueError};
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

#[test]
fn moving_both_directions_keeps_sheet_data_and_dependencies() {
    let mut wb = Workbook::new();
    let data = wb.add_sheet("Data");
    wb.set_cell(data, "A1", Value::Number(7.0));
    wb.set_formula(0, "A1", "=Data!A1*2");
    assert!(wb.move_sheet(1, 0));
    assert_eq!(wb.name(0), Some("Data"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(14.0));
    wb.set_cell(0, "A1", Value::Number(9.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(18.0));
    assert!(wb.move_sheet(0, 1));
    assert_eq!(wb.get_cell("Data", "A1"), Value::Number(9.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(18.0));
    assert!(!wb.move_sheet(1, 2));
    assert_eq!(wb.name(1), Some("Data"));
}

#[test]
fn deletion_leaves_explicit_broken_refs_that_never_bind_to_a_new_same_named_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.set_cell(1, "A1", Value::Number(7.0));
    wb.set_formula(0, "A1", "=Data!A1");
    wb.set_formula(0, "A2", "=IFERROR(SUM(Data!A1:A3),42)");
    wb.set_formula(0, "A3", "=\"Data!A1\"");
    assert!(wb.remove_sheet(1).is_some());
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(42.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Data!A1".into()));
    wb.add_sheet("Data");
    wb.set_cell(1, "A1", Value::Number(99.0));
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(42.0));
}

#[test]
fn last_sheet_and_unknown_indices_are_rejected_without_clearing_data() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    assert!(wb.remove_sheet(0).is_none());
    assert!(wb.remove_sheet(5).is_none());
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
}

fn options() -> ClipboardPasteOptions {
    // 复用普通粘贴默认值；本组测试只约束目标位置与工作表大小。
    ClipboardPasteOptions {
        row_count: 20,
        col_count: 5,
        ..ClipboardPasteOptions::new(CellRange::single(CellAddress::new(2, 0)))
    }
}

#[test]
fn cut_snapshot_can_follow_a_moved_sheet_without_erasing_its_neighbor() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.set_cell(0, "A1", Value::Number(99.0));
    wb.set_cell(1, "A1", Value::Number(7.0));
    let mut snapshot = wb
        .capture_clipboard(1, CellRange::single(CellAddress::new(0, 0)), true)
        .unwrap();
    wb.move_sheet(1, 0);
    assert!(snapshot.remap_source_sheet(|idx| Some(if idx == 1 { 0 } else { 1 })));
    wb.paste_clipboard(&snapshot, 0, &options()).unwrap();
    assert_eq!(wb.get_cell("Data", "A1"), Value::Null);
    assert_eq!(wb.get_cell("Data", "A3"), Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(99.0));
}

#[test]
fn clipboard_static_refs_follow_deleted_sheets_and_deleted_source_is_invalidated() {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.set_cell(1, "A1", Value::Number(7.0));
    wb.set_formula(0, "A1", "=Data!A1");
    let mut snapshot = wb
        .capture_clipboard(0, CellRange::single(CellAddress::new(0, 0)), false)
        .unwrap();
    let mut removed = wb
        .capture_clipboard(1, CellRange::single(CellAddress::new(0, 0)), true)
        .unwrap();
    wb.remove_sheet(1);
    snapshot.rewrite_sheet_references("Data", None);
    assert!(!removed.remap_source_sheet(|_| None));
    wb.add_sheet("Data");
    wb.set_cell(1, "A1", Value::Number(99.0));
    wb.paste_clipboard(&snapshot, 0, &options()).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "A3"),
        Value::Error(ValueError::InvalidRef)
    );
}
