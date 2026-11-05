//! Validation anchors that cannot simply follow a reference rewrite (#15): whole-axis regions,
//! anchors pushed off the sheet, and formulas that do not fit at the region start.
use super::*;
use einfach_excel_core::CellShiftDirection;

fn rejects(book: &mut Workbook, sheet: usize, cell: &str, input: &str) -> bool {
    book.set_cell_input(sheet, cell, input).is_err()
}

#[test]
fn a_whole_column_rule_keeps_checking_each_cell_after_a_top_insert() {
    // 回归：整列区域按"未移动"处理，公式改成 =B2>0 而锚点仍是 B1，每格都检查下一行。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "B1", Value::Number(1.0));
    book.set_cell(0, "B2", Value::Number(1.0));
    install(&mut book, range("B1", "B1048576"), formula("=B1>0", "B1"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("B1", "B1"), down).unwrap());
    assert!(rejects(&mut book, 0, "B2", "-1"));
    assert!(rejects(&mut book, 0, "B1", "-1"));
    assert!(!rejects(&mut book, 0, "B3", "5"));
}

#[test]
fn a_whole_row_rule_keeps_checking_each_cell_after_a_left_delete() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("A1", "XFD1"), formula("=A1>0", "A1"));
    let left = CellShiftDirection::DeleteLeft;
    assert!(history.shift_cells(&mut book, 0, range("A1", "A1"), left).unwrap());
    assert!(rejects(&mut book, 0, "B1", "-1"));
    assert!(!rejects(&mut book, 0, "XFD1", "1"));
}

#[test]
fn an_anchor_pushed_off_the_sheet_still_rewrites_absolute_references() {
    // 回归：锚点移出画布、重定到起点又多出 #REF!，规则原样保留，$B$1 不再跟随下移的数据。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("B1", "B2"), formula("=AND(IFERROR($C1,1)=1,$B$1>0)", "B1048576"));
    assert!(!rejects(&mut book, 0, "B1", "1"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("B1", "B1"), down).unwrap());
    assert!(!rejects(&mut book, 0, "B2", "2"));
    assert!(rejects(&mut book, 0, "B2", "-2"));
}

#[test]
fn a_cross_sheet_rule_keeps_a_reference_that_survives_a_delete() {
    // 回归：改写后回到旧锚点 B1，Sheet1!A1 上移四行越界，规则永久变成 #REF!。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A5", Value::Number(1.0));
    let other = book.add_sheet("Other");
    book.sheet_mut(other).unwrap()
        .set_data_validation(range("B5", "B5"), Some(formula("=Sheet1!A1>0", "B1"))).unwrap();
    assert!(!rejects(&mut book, other, "B5", "x"));
    let up = CellShiftDirection::DeleteUp;
    assert!(history.shift_cells(&mut book, 0, range("A1", "A4"), up).unwrap());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
    assert!(!rejects(&mut book, other, "B5", "y"));
    book.set_cell(0, "A1", Value::Number(0.0));
    assert!(rejects(&mut book, other, "B5", "z"));
}

#[test]
fn converting_a_table_keeps_this_row_for_a_rule_that_cannot_move_to_its_start() {
    // 回归：公式放不到区域起点时以锚点为位置，却按区域起点写本行引用，B3 改为检查表头 A1。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Check".into()));
    for row in 2..=4 {
        book.set_cell(0, &format!("A{row}"), Value::Number(row as f64));
    }
    history.create_table(&mut book, 0, range("A1", "B4"), Some("Sales")).unwrap();
    book.set_cell(0, "C1", Value::Number(1.0));
    install(&mut book, range("B2", "B3"), formula("=AND(Sales[@Amount]=3,$C2=1)", "B4"));
    assert!(!rejects(&mut book, 0, "B3", "x"));
    history.convert_table_to_range(&mut book, "Sales").unwrap();
    assert!(!rejects(&mut book, 0, "B3", "y"));
    book.set_cell(0, "A3", Value::Number(9.0));
    assert!(rejects(&mut book, 0, "B3", "z"));
}

#[test]
fn a_sheet_named_like_an_error_is_not_an_invalid_reference() {
    // 回归：按渲染文本数 "#REF!"，表名本身被算作一个错误，平移越界因此被放行。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let other = book.add_sheet("#REF!");
    book.set_cell(other, "A1", Value::Number(1.0));
    install(&mut book, range("B1", "B3"), formula("='#REF!'!$A2>0", "B4"));
    assert!(!rejects(&mut book, 0, "B3", "x"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("D1", "D1"), down).unwrap());
    assert!(!rejects(&mut book, 0, "B3", "y"));
}
