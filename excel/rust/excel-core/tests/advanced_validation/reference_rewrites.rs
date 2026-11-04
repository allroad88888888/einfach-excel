//! Validation formulas follow every reference rewrite that cell formulas follow (#15).
use super::*;
use einfach_excel_core::workbook::NamedRangeAction;
use einfach_excel_core::CellShiftDirection;

fn install_on(book: &mut Workbook, sheet: usize, target: &str, rule: DataValidationRule) {
    book.sheet_mut(sheet).unwrap().set_data_validation(range(target, target), Some(rule)).unwrap();
}
fn rule_at(book: &Workbook, sheet: usize, cell: &str) -> Option<(String, CellAddress)> {
    match &book.sheet(sheet).unwrap().data_validation_at(addr(cell))?.kind {
        DataValidationKind::CustomFormula { formula, anchor } => Some((formula.clone(), *anchor)),
        _ => None,
    }
}
fn same_formula(actual: Option<(String, CellAddress)>, expected: &str, anchor: &str) -> bool {
    actual.is_some_and(|(formula, at)| einfach_excel_core::parse_formula(&formula)
        == einfach_excel_core::parse_formula(expected) && at == addr(anchor))
}

/// `Sheet1!A1:A3` is Table `Sales[Amount]` = 2, 3; `Other!B1` only accepts input while it sums to 5.
fn table_with_validated_consumer() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "A2", Value::Number(2.0));
    book.set_cell(0, "A3", Value::Number(3.0));
    history.create_table(&mut book, 0, range("A1", "A3"), Some("Sales")).unwrap();
    book.add_sheet("Other");
    install_on(&mut book, 1, "B1", formula("=SUM(Sales[Amount])=5", "B1"));
    assert!(book.set_cell_input(1, "B1", "1").is_ok());
    (book, history)
}

#[test]
fn table_and_column_renames_rewrite_validation_formulas_through_history() {
    // 回归：改名只改写单元格、条件格式和命名公式，验证规则仍引用旧名，输入随即被拒。
    let (mut book, mut history) = table_with_validated_consumer();
    assert!(history.rename_table(&mut book, "Sales", "Orders").unwrap());
    assert!(same_formula(rule_at(&book, 1, "B1"), "=SUM(Orders[Amount])=5", "B1"));
    assert!(book.set_cell_input(1, "B1", "2").is_ok());
    assert!(history.rename_table_column(&mut book, "Orders", "Amount", "Total").unwrap());
    assert!(same_formula(rule_at(&book, 1, "B1"), "=SUM(Orders[Total])=5", "B1"));
    history.undo(&mut book).unwrap();
    history.undo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 1, "B1"), "=SUM(Sales[Amount])=5", "B1"));
    history.redo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 1, "B1"), "=SUM(Orders[Amount])=5", "B1"));
}

#[test]
fn converting_a_table_to_a_range_rewrites_validation_formulas() {
    let (mut book, mut history) = table_with_validated_consumer();
    history.convert_table_to_range(&mut book, "Sales").unwrap();
    let (formula, _) = rule_at(&book, 1, "B1").unwrap();
    assert!(!formula.contains("Sales["), "{formula}");
    assert!(book.set_cell_input(1, "B1", "3").is_ok());
    history.undo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 1, "B1"), "=SUM(Sales[Amount])=5", "B1"));
}

#[test]
fn renaming_a_name_rewrites_validation_formulas() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Number(5.0));
    let create = NamedRangeAction::Create { name: "Limit".into(), sheet: 0, range: range("A1", "A1") };
    history.change_named_range(&mut book, 0, create).unwrap();
    install(&mut book, range("B1", "B1"), formula("=B1<=Limit", "B1"));
    let rename = NamedRangeAction::Update { name: "Limit".into(), new_name: "Cap".into(), target: None };
    history.change_named_range(&mut book, 0, rename).unwrap();
    assert!(same_formula(rule_at(&book, 0, "B1"), "=B1<=Cap", "B1"));
    assert_eq!(book.set_cell_input(0, "B1", "9"), Err("DATA_VALIDATION_FAILED"));
    assert!(book.set_cell_input(0, "B1", "4").is_ok());
}

#[test]
fn cell_shifts_rewrite_validation_formulas_on_other_sheets() {
    // 回归：插入单元格下移后，其他表的验证公式仍指向旧格，输入随即被拒。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A2", Value::Number(5.0));
    book.add_sheet("Other");
    install_on(&mut book, 1, "B1", formula("=Sheet1!A2=5", "B1"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("A1", "A1"), down).unwrap());
    assert!(same_formula(rule_at(&book, 1, "B1"), "=Sheet1!A3=5", "B1"));
    assert!(book.set_cell_input(1, "B1", "1").is_ok());
    history.undo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 1, "B1"), "=Sheet1!A2=5", "B1"));
}

#[test]
fn cell_shifts_move_local_validation_anchors_with_their_formulas() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("B5", "B5"), formula("=A5>0", "B5"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("A1", "B1"), down).unwrap());
    assert!(same_formula(rule_at(&book, 0, "B6"), "=A6>0", "B6"));
    history.undo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 0, "B5"), "=A5>0", "B5"));
}

#[test]
fn deleting_a_validation_anchor_rebases_onto_the_first_surviving_cell() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("B2", "B4"), formula("=B2>A2", "B2"));
    let up = CellShiftDirection::DeleteUp;
    assert!(history.shift_cells(&mut book, 0, range("B2", "B2"), up).unwrap());
    // 原 B3 的规则（比较 A3）上移到 B2；A 列不在位移带内，仍比较 A3。
    assert!(same_formula(rule_at(&book, 0, "B2"), "=B2>A3", "B2"));
    assert!(rule_at(&book, 0, "B4").is_none());
    book.set_cell(0, "A3", Value::Number(5.0));
    assert_eq!(book.set_cell_input(0, "B2", "1"), Err("DATA_VALIDATION_FAILED"));
    assert!(book.set_cell_input(0, "B2", "6").is_ok());
}

#[test]
fn a_split_validation_keeps_the_unmoved_piece_on_its_own_cells() {
    // 回归：区域拆成移动与不动两块却共用移动后的锚点，不动的 C2 改为检查 $A1。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Number(0.0));
    book.set_cell(0, "A2", Value::Number(1.0));
    install(&mut book, range("B2", "C2"), formula("=$A2>0", "B2"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("B1", "B1"), down).unwrap());
    assert!(same_formula(rule_at(&book, 0, "C2"), "=$A2>0", "C2"));
    assert!(same_formula(rule_at(&book, 0, "B3"), "=$A2>0", "B3"));
    assert!(book.set_cell_input(0, "C2", "1").is_ok());
    assert!(book.set_cell_input(0, "B3", "1").is_ok());
}

#[test]
fn converting_a_table_reads_this_row_references_from_the_rule_anchor() {
    // 回归：按区域起点 B3 换算本行引用、却保留锚点 B2，求值时再偏移一行，B3 改为检查 A4。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Check".into()));
    for (row, amount) in [(2, 2.0), (3, 3.0), (4, 4.0)] {
        book.set_cell(0, &format!("A{row}"), Value::Number(amount));
    }
    history.create_table(&mut book, 0, range("A1", "B4"), Some("Sales")).unwrap();
    install(&mut book, range("B2", "B3"), formula("=Sales[@Amount]=3", "B2"));
    book.sheet_mut(0).unwrap().set_data_validation(range("B2", "B2"), None).unwrap();
    assert!(book.set_cell_input(0, "B3", "x").is_ok());
    history.convert_table_to_range(&mut book, "Sales").unwrap();
    assert!(book.set_cell_input(0, "B3", "y").is_ok());
}

#[test]
fn appending_a_table_row_rewrites_validations_on_its_sheet() {
    // 回归：Table 行带插入跳过本表验证规则，C1 仍检查已经移走的 A4。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Qty".into()));
    book.set_cell(0, "A2", Value::Number(1.0));
    book.set_cell(0, "A4", Value::Number(5.0));
    history.create_table(&mut book, 0, range("A1", "A2"), Some("Lines")).unwrap();
    install(&mut book, range("C1", "C1"), formula("=$A$4=5", "C1"));
    history.append_table_row(&mut book, "Lines", 1_048_576).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Number(5.0));
    assert!(same_formula(rule_at(&book, 0, "C1"), "=$A$5=5", "C1"));
    assert!(book.set_cell_input(0, "C1", "1").is_ok());
    history.undo(&mut book).unwrap();
    assert!(same_formula(rule_at(&book, 0, "C1"), "=$A$4=5", "C1"));
}

#[test]
fn a_whole_column_validation_survives_a_cell_insert_at_its_first_row() {
    // 回归：整列区域位移前后范围相同，按"已移动"求位移前位置时 0 - 1 下溢。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    install(&mut book, range("B1", "B1048576"), formula("=B1>0", "B1"));
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("B1", "B1"), down).unwrap());
    assert!(rule_at(&book, 0, "B5").is_some());
}

#[test]
fn an_unrelated_cell_shift_leaves_a_partly_out_of_range_rule_intact() {
    // 回归：未移动的规则也被重定到区域起点，B1 处越界的引用变成 #REF!，B2、B3 随之全部失效。
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Number(1.0));
    install(&mut book, range("B1", "B3"), formula("=$A1>0", "B2"));
    assert!(book.set_cell_input(0, "B2", "1").is_ok());
    let down = CellShiftDirection::InsertDown;
    assert!(history.shift_cells(&mut book, 0, range("D1", "D1"), down).unwrap());
    assert!(same_formula(rule_at(&book, 0, "B2"), "=$A1>0", "B2"));
    assert!(book.set_cell_input(0, "B2", "2").is_ok());
}

/// `Sheet1!A1:B4` is Table `Sales` (Amount 2, 3, 4 in A2:A4) for validation context tests.
fn sales_table() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.set_cell(0, "B1", Value::Text("Check".into()));
    for row in 2..=4 {
        book.set_cell(0, &format!("A{row}"), Value::Number(row as f64));
    }
    history.create_table(&mut book, 0, range("A1", "B4"), Some("Sales")).unwrap();
    (book, history)
}

#[test]
fn converting_a_table_handles_a_validation_anchored_on_the_header() {
    // 回归：以表头锚点解析本行引用直接得到错误表达式，转换后所有输入都被拒。
    let (mut book, mut history) = sales_table();
    install(&mut book, range("B2", "B3"), formula("=Sales[@Amount]>0", "B1"));
    assert!(book.set_cell_input(0, "B2", "x").is_ok());
    history.convert_table_to_range(&mut book, "Sales").unwrap();
    assert!(book.set_cell_input(0, "B2", "y").is_ok());
    assert!(book.set_cell_input(0, "B3", "z").is_ok());
}

#[test]
fn renaming_a_column_rewrites_a_validation_anchored_outside_the_table() {
    // 回归：以表外锚点判断裸列引用的归属，改名被跳过，验证仍引用旧列。
    let (mut book, mut history) = sales_table();
    install(&mut book, range("B2", "B3"), formula("=[@Amount]>0", "D1"));
    assert!(book.set_cell_input(0, "B2", "x").is_ok());
    assert!(history.rename_table_column(&mut book, "Sales", "Amount", "Total").unwrap());
    assert!(book.set_cell_input(0, "B2", "y").is_ok());
}

/// B2:B4 checks column C row by row; C5 is 0 so a rule that slips one row down rejects B5.
fn expanded_piece(table: bool) {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    if table {
        book.set_cell(0, "A1", Value::Text("Qty".into()));
        book.set_cell(0, "B1", Value::Text("Check".into()));
        book.set_cell(0, "A2", Value::Number(1.0));
        history.create_table(&mut book, 0, range("A1", "B2"), Some("Lines")).unwrap();
    }
    for row in 2..=4 {
        book.set_cell(0, &format!("C{row}"), Value::Number(1.0));
    }
    book.set_cell(0, "C5", Value::Number(0.0));
    install(&mut book, range("B2", "B4"), formula("=$C2>0", "B2"));
    assert!(book.set_cell_input(0, "B4", "9").is_ok());
    if table {
        history.append_table_row(&mut book, "Lines", 1_048_576).unwrap();
    } else {
        let down = CellShiftDirection::InsertDown;
        assert!(history.shift_cells(&mut book, 0, range("B3", "B3"), down).unwrap());
    }
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(9.0));
    assert!(book.set_cell_input(0, "B5", "10").is_ok());
    assert!(book.set_cell_input(0, "B2", "1").is_ok());
}

#[test]
fn the_moved_part_of_an_expanded_region_keeps_checking_its_own_row() {
    // 回归：跨过插入线的区域只有一个锚点，移到 B5 的原 B4 改为检查 C5。
    expanded_piece(false);
}

#[test]
fn a_table_row_insert_keeps_the_moved_validation_on_its_own_row() {
    expanded_piece(true);
}
