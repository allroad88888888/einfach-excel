//! 插入/删除单元格的原生语义：内容与格式随带移动，引用按 Excel 局部位移规则改写。
use crate::workbook_history::WorkbookHistory;
use crate::{CellAddress, CellRange, CellShiftDirection, CellStyle, MergeAction, Workbook};
use einfach_core::{Value, ValueError};

fn a(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}

fn r(start: &str, end: &str) -> CellRange {
    CellRange::new(a(start), a(end))
}

fn formula(wb: &Workbook, sheet: usize, addr: &str) -> Option<String> {
    wb.sheet(sheet).unwrap().get_formula(addr)
}

fn shift(
    wb: &mut Workbook,
    history: &mut WorkbookHistory,
    range: CellRange,
    direction: CellShiftDirection,
) -> Result<bool, &'static str> {
    history.shift_cells(wb, 0, range, direction)
}

#[test]
fn insert_right_moves_band_and_follows_references() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_cell(0, "B1", Value::Number(2.0));
    wb.set_formula(0, "C1", "=B1*10");
    wb.set_cell(0, "B2", Value::Number(5.0));
    wb.set_formula(0, "E5", "=B1+B2");
    wb.set_formula(0, "E6", "=SUM(A1:C1)");
    wb.set_formula(0, "E7", "=SUM(B1:B2)");
    wb.sheets[0].cell_styles.insert(a("B1"), CellStyle { bold: Some(true), ..Default::default() });
    wb.add_sheet("Other");
    wb.set_formula(1, "A1", "=Sheet1!B1");

    assert!(shift(&mut wb, &mut history, r("B1", "B1"), CellShiftDirection::InsertRight).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(2.0));
    assert_eq!(formula(&wb, 0, "D1").as_deref(), Some("=(C1*10)"));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(20.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(5.0));
    assert_eq!(formula(&wb, 0, "E5").as_deref(), Some("=(C1+B2)"));
    assert_eq!(formula(&wb, 0, "E6").as_deref(), Some("=SUM(A1:D1)"));
    // 部分重叠位移带的矩形不调整。
    assert_eq!(formula(&wb, 0, "E7").as_deref(), Some("=SUM(B1:B2)"));
    assert_eq!(formula(&wb, 1, "A1").as_deref(), Some("=Sheet1!C1"));
    assert!(wb.sheets[0].cell_styles.contains_key(&a("C1")));
    assert!(!wb.sheets[0].cell_styles.contains_key(&a("B1")));
    assert_eq!(history.undo_count(), 1);

    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(2.0));
    assert_eq!(formula(&wb, 0, "C1").as_deref(), Some("=B1*10"));
    assert_eq!(formula(&wb, 0, "E6").as_deref(), Some("=SUM(A1:C1)"));
    assert_eq!(formula(&wb, 1, "A1").as_deref(), Some("=Sheet1!B1"));
    assert!(wb.sheets[0].cell_styles.contains_key(&a("B1")));
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(20.0));
    assert_eq!(formula(&wb, 1, "A1").as_deref(), Some("=Sheet1!C1"));
}

#[test]
fn insert_down_expands_column_ranges_inside_the_band() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    for (row, value) in [(1, 1.0), (2, 2.0), (3, 3.0)] {
        wb.set_cell(0, &format!("B{row}"), Value::Number(value));
    }
    wb.set_formula(0, "D1", "=SUM(B1:B3)");
    wb.set_formula(0, "D2", "=SUM(B1:C3)");
    wb.set_formula(0, "D3", "=B2");
    shift(&mut wb, &mut history, r("B2", "B3"), CellShiftDirection::InsertDown).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "B5"), Value::Number(3.0));
    assert_eq!(formula(&wb, 0, "D1").as_deref(), Some("=SUM(B1:B5)"));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(6.0));
    assert_eq!(formula(&wb, 0, "D2").as_deref(), Some("=SUM(B1:C3)"));
    assert_eq!(formula(&wb, 0, "D3").as_deref(), Some("=B4"));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(2.0));
    assert_eq!(formula(&wb, 0, "D3").as_deref(), Some("=B2"));
}

#[test]
fn delete_left_turns_deleted_references_into_ref_errors() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.set_cell(0, "B1", Value::Number(2.0));
    wb.set_cell(0, "C1", Value::Number(3.0));
    wb.set_formula(0, "A3", "=B1");
    wb.set_formula(0, "B3", "=C1");
    wb.set_formula(0, "C3", "=SUM(A1:C1)");
    shift(&mut wb, &mut history, r("B1", "B1"), CellShiftDirection::DeleteLeft).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
    assert_eq!(formula(&wb, 0, "A3").as_deref(), Some("=#REF!"));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Error(ValueError::InvalidRef));
    assert_eq!(formula(&wb, 0, "B3").as_deref(), Some("=B1"));
    assert_eq!(formula(&wb, 0, "C3").as_deref(), Some("=SUM(A1:B1)"));
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(4.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(formula(&wb, 0, "A3").as_deref(), Some("=B1"));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(2.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(formula(&wb, 0, "A3").as_deref(), Some("=#REF!"));
}

#[test]
fn delete_up_moves_cells_and_notes_below_the_selection() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A2", Value::Number(2.0));
    wb.set_cell(0, "A3", Value::Number(3.0));
    wb.set_cell(0, "B3", Value::Number(9.0));
    wb.sheets[0].set_note(a("A3"), Some("moved")).unwrap();
    wb.set_formula(0, "D1", "=A3");
    wb.set_formula(0, "D2", "=A2");
    shift(&mut wb, &mut history, r("A2", "A2"), CellShiftDirection::DeleteUp).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(9.0));
    assert_eq!(wb.sheets[0].note(a("A2")), Some("moved"));
    assert_eq!(formula(&wb, 0, "D1").as_deref(), Some("=A2"));
    assert_eq!(formula(&wb, 0, "D2").as_deref(), Some("=#REF!"));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheets[0].note(a("A3")), Some("moved"));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(2.0));
}

#[test]
fn whole_merges_move_and_partial_merges_are_rejected() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.merge_cells(&mut wb, 0, r("C1", "D1"), MergeAction::Merge, true).unwrap();
    shift(&mut wb, &mut history, r("A1", "A1"), CellShiftDirection::InsertRight).unwrap();
    assert_eq!(wb.sheets[0].merged_ranges(), &[r("D1", "E1")]);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheets[0].merged_ranges(), &[r("C1", "D1")]);

    history.merge_cells(&mut wb, 0, r("C3", "D4"), MergeAction::Merge, true).unwrap();
    let before = history.undo_count();
    wb.set_cell(0, "E3", Value::Number(1.0));
    assert_eq!(
        shift(&mut wb, &mut history, r("A3", "A3"), CellShiftDirection::InsertRight),
        Err(super::preflight::MERGE_ERROR)
    );
    assert_eq!(
        shift(&mut wb, &mut history, r("C3", "C4"), CellShiftDirection::DeleteLeft),
        Err(super::preflight::MERGE_ERROR)
    );
    assert_eq!(history.undo_count(), before);
    assert_eq!(wb.get_cell("Sheet1", "E3"), Value::Number(1.0));
}

#[test]
fn tables_spills_protection_and_off_sheet_content_are_rejected() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "D1", Value::Text("H".into()));
    wb.define_table(None, 0, r("D1", "D3"), true).unwrap();
    assert_eq!(
        shift(&mut wb, &mut history, r("A2", "A2"), CellShiftDirection::InsertRight),
        Err(super::preflight::TABLE_ERROR)
    );
    // 表在带外时允许。
    assert!(shift(&mut wb, &mut history, r("A5", "A5"), CellShiftDirection::InsertRight).unwrap());

    wb.set_formula(0, "A10", "=SEQUENCE(3)");
    assert_eq!(
        shift(&mut wb, &mut history, r("A11", "A11"), CellShiftDirection::InsertRight),
        Err(super::preflight::SPILL_ERROR)
    );
    assert!(shift(&mut wb, &mut history, r("A10", "A12"), CellShiftDirection::InsertRight).unwrap());
    assert_eq!(formula(&wb, 0, "B10").as_deref(), Some("=SEQUENCE(3)"));
    assert_eq!(wb.get_cell("Sheet1", "B12"), Value::Number(3.0));

    wb.set_cell(0, "XFD20", Value::Number(1.0));
    assert_eq!(
        shift(&mut wb, &mut history, r("A20", "A20"), CellShiftDirection::InsertRight),
        Err(super::preflight::OFF_SHEET_ERROR)
    );
    wb.change_protection(0, crate::protection::ProtectionChange::Protect).unwrap();
    assert_eq!(
        shift(&mut wb, &mut history, r("A30", "A30"), CellShiftDirection::InsertDown),
        Err(crate::protection::PROTECTED_ERROR)
    );
}

#[test]
fn validation_conditional_ranges_and_named_ranges_follow_the_band() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "B2", Value::Number(1.0));
    wb.define_named_range("Pick", 0, r("B2", "B3")).unwrap();
    wb.set_formula(0, "D1", "=SUM(Pick)");
    shift(&mut wb, &mut history, r("B1", "B1"), CellShiftDirection::InsertDown).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(1.0));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(1.0));
}
