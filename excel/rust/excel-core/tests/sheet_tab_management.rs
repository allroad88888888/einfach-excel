//! 复制工作表、隐藏/取消隐藏、页签颜色：引擎行为与原生历史。
use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, FrozenPanes, Workbook};

fn addr(row: u32, col: u32) -> CellAddress {
    CellAddress::new(row, col)
}

fn num(wb: &Workbook, sheet: &str, a1: &str) -> Value {
    wb.get_cell(sheet, a1)
}

fn seeded() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    wb.set_cell(0, "A1", Value::Number(5.0));
    wb.set_cell(0, "A2", Value::Text("label".into()));
    wb.set_formula(0, "B1", "=A1*2");
    wb.set_formula(0, "B2", "=Sheet1!A1+1");
    wb.set_cell(1, "A1", Value::Number(100.0));
    wb.set_formula(0, "B3", "=Other!A1");
    (wb, WorkbookHistory::default())
}

#[test]
fn duplicate_copies_cells_and_keeps_formulas_local_to_the_copy() {
    let (mut wb, mut history) = seeded();
    let index = history.duplicate_sheet(&mut wb, 0).unwrap();
    assert_eq!(index, 1, "the copy sits right after its source");
    assert_eq!(wb.name(1), Some("Sheet1 (2)"));
    assert_eq!(wb.name(2), Some("Other"));
    assert_eq!(num(&wb, "Sheet1 (2)", "A1"), Value::Number(5.0));
    assert_eq!(num(&wb, "Sheet1 (2)", "A2"), Value::Text("label".into()));
    assert_eq!(wb.sheet(1).unwrap().get_formula("B2").as_deref(), Some("=('Sheet1 (2)'!A1+1)"));
    // 修改副本不能影响源表，反之亦然。
    wb.set_cell(1, "A1", Value::Number(50.0));
    assert_eq!(num(&wb, "Sheet1 (2)", "B1"), Value::Number(100.0));
    assert_eq!(num(&wb, "Sheet1", "B1"), Value::Number(10.0));
    // 指向其它表的引用保持不变。
    assert_eq!(num(&wb, "Sheet1 (2)", "B3"), Value::Number(100.0));
    let second = history.duplicate_sheet(&mut wb, 0).unwrap();
    assert_eq!(wb.name(second), Some("Sheet1 (3)"));
    let from_copy = history.duplicate_sheet(&mut wb, 2).unwrap();
    assert_eq!(wb.name(from_copy), Some("Sheet1 (4)"), "suffix restarts from the base name");
}

#[test]
fn duplicate_copies_sheet_level_metadata() {
    let (mut wb, mut history) = seeded();
    let sheet = wb.sheet_mut(0).unwrap();
    sheet.set_col_width(1, 222);
    sheet.set_row_height(2, 44);
    sheet.set_frozen_panes(FrozenPanes { rows: 1, cols: 1 }).unwrap();
    sheet.set_note(addr(0, 0), Some("note text")).unwrap();
    sheet.set_hyperlink(addr(1, 0), Some("https://example.com/")).unwrap();
    sheet
        .restore_merged_ranges(vec![CellRange::new(addr(4, 4), addr(5, 5))])
        .unwrap();
    history.set_sheet_tab_color(&mut wb, 0, Some("#ff0000")).unwrap();
    history.duplicate_sheet(&mut wb, 0).unwrap();
    let copy = wb.sheet(1).unwrap();
    assert_eq!(copy.col_width(1), Some(222));
    assert_eq!(copy.row_height(2), Some(44));
    assert_eq!(copy.frozen_panes(), FrozenPanes { rows: 1, cols: 1 });
    assert_eq!(copy.note(addr(0, 0)), Some("note text"));
    assert_eq!(copy.merged_ranges().len(), 1);
    assert_eq!(wb.sheet_tab_color(1), Some("#FF0000"));
    assert!(!wb.sheet_hidden(1));
}

#[test]
fn duplicate_renames_tables_and_retargets_structured_references() {
    let (mut wb, mut history) = seeded();
    wb.set_cell(0, "D1", Value::Text("Qty".into()));
    wb.set_cell(0, "D2", Value::Number(3.0));
    wb.set_cell(0, "D3", Value::Number(4.0));
    let table = wb
        .define_table(None, 0, CellRange::new(addr(0, 3), addr(2, 3)), true)
        .unwrap();
    wb.set_formula(0, "F1", &format!("=SUM({table}[Qty])"));
    history.duplicate_sheet(&mut wb, 0).unwrap();
    let tables: Vec<_> = wb.list_tables().iter().map(|t| (t.name().to_owned(), t.sheet_name().to_owned())).collect();
    assert!(tables.contains(&(format!("{table}_2"), "Sheet1 (2)".to_owned())), "{tables:?}");
    assert_eq!(
        wb.sheet(1).unwrap().get_formula("F1").as_deref(),
        Some(format!("=SUM({table}_2[Qty])").as_str())
    );
    wb.set_cell(1, "D2", Value::Number(10.0));
    assert_eq!(num(&wb, "Sheet1 (2)", "F1"), Value::Number(14.0));
    assert_eq!(num(&wb, "Sheet1", "F1"), Value::Number(7.0));
}

#[test]
fn duplicate_is_one_undo_step_and_redo_restores_the_same_sheet() {
    let (mut wb, mut history) = seeded();
    history.duplicate_sheet(&mut wb, 0).unwrap();
    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.sheet_count(), 2);
    assert_eq!(wb.index_of("Sheet1 (2)"), None);
    assert!(wb.list_tables().is_empty());
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.name(1), Some("Sheet1 (2)"));
    assert_eq!(num(&wb, "Sheet1 (2)", "B1"), Value::Number(10.0));
}

#[test]
fn hide_unhide_is_validated_and_one_undo_step_each() {
    let (mut wb, mut history) = seeded();
    assert!(history.set_sheet_hidden(&mut wb, 1, true).unwrap());
    assert!(wb.sheet_hidden(1));
    assert_eq!(history.undo_count(), 1);
    assert!(!history.set_sheet_hidden(&mut wb, 1, true).unwrap(), "no-op is not a step");
    assert_eq!(history.undo_count(), 1);
    // 最后一张可见表不能隐藏。
    let error = history.set_sheet_hidden(&mut wb, 0, true).unwrap_err();
    assert_eq!(error, einfach_excel_core::workbook::SHEET_TAB_LAST_VISIBLE);
    assert!(!wb.sheet_hidden(0));
    // 公式引用隐藏表仍然工作。
    assert_eq!(num(&wb, "Sheet1", "B3"), Value::Number(100.0));
    assert!(history.undo(&mut wb).unwrap());
    assert!(!wb.sheet_hidden(1));
    assert!(history.redo(&mut wb).unwrap());
    assert!(wb.sheet_hidden(1));
    assert!(history.set_sheet_hidden(&mut wb, 1, false).unwrap());
    assert!(!wb.sheet_hidden(1));
}

#[test]
fn deleting_the_last_visible_sheet_is_refused_while_others_are_hidden() {
    let (mut wb, mut history) = seeded();
    history.set_sheet_hidden(&mut wb, 1, true).unwrap();
    assert!(history.remove_sheet(&mut wb, 0).is_err());
    assert_eq!(wb.sheet_count(), 2);
    // 删除隐藏表本身是允许的。
    history.remove_sheet(&mut wb, 1).unwrap();
    assert_eq!(wb.sheet_count(), 1);
}

#[test]
fn tab_color_accepts_rrggbb_only_and_undoes() {
    let (mut wb, mut history) = seeded();
    assert!(history.set_sheet_tab_color(&mut wb, 0, Some("#1a2B3c")).unwrap());
    assert_eq!(wb.sheet_tab_color(0), Some("#1A2B3C"));
    assert!(history.set_sheet_tab_color(&mut wb, 0, Some("red")).is_err());
    assert!(history.set_sheet_tab_color(&mut wb, 0, Some("#12345")).is_err());
    assert!(!history.set_sheet_tab_color(&mut wb, 0, Some("#1A2B3C")).unwrap());
    assert_eq!(history.undo_count(), 1);
    assert!(history.set_sheet_tab_color(&mut wb, 0, None).unwrap());
    assert_eq!(wb.sheet_tab_color(0), None);
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.sheet_tab_color(0), Some("#1A2B3C"));
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.sheet_tab_color(0), None);
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.sheet_tab_color(0), Some("#1A2B3C"));
}

#[test]
fn tab_state_travels_with_the_sheet_through_move_and_delete_undo() {
    let (mut wb, mut history) = seeded();
    history.set_sheet_tab_color(&mut wb, 1, Some("#00FF00")).unwrap();
    history.set_sheet_hidden(&mut wb, 1, true).unwrap();
    history.move_sheet(&mut wb, 1, 0).unwrap();
    assert!(wb.sheet_hidden(0));
    assert_eq!(wb.sheet_tab_color(0), Some("#00FF00"));
    history.remove_sheet(&mut wb, 0).unwrap();
    assert!(history.undo(&mut wb).unwrap());
    assert!(wb.sheet_hidden(0));
    assert_eq!(wb.sheet_tab_color(0), Some("#00FF00"));
}
