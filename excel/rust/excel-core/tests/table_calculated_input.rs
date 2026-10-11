//! 用户编辑入口的计算列事务：只改 Table 数据区，成功/拒绝均保持单步历史。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, NumberFormat, StyleScope, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn seed() -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    for (address, text) in [("A1", "Amount"), ("B1", "Total")] {
        book.set_cell(0, address, Value::Text(text.into()));
    }
    for (address, number) in [("A2", 10.), ("A3", 20.), ("A4", 30.), ("D1", 5.)] {
        book.set_cell(0, address, Value::Number(number));
    }
    book.define_table(Some("Orders"), 0, range("A1", "B4"), true).unwrap();
    (book, WorkbookHistory::default())
}
fn values(book: &Workbook) -> Vec<Value> {
    ["B2", "B3", "B4"].map(|addr| book.get_cell("Sheet1", addr)).to_vec()
}

#[test]
fn entering_in_middle_fills_up_and_down_and_undo_restores_column_definition() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B3", "=A3+$D$1").unwrap();
    assert_eq!(values(&book), vec![Value::Number(15.), Value::Number(25.), Value::Number(35.)]);
    assert_eq!(book.sheet(0).unwrap().get_formula("B2").as_deref(), Some("=(A2+$D$1)"));
    assert_eq!(history.undo_count(), 1);
    let definition = book.get_table("Orders").unwrap().clone();
    for _ in 0..2 {
        history.undo(&mut book).unwrap();
        assert_eq!(values(&book), vec![Value::Null; 3]);
        assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_table("Orders"), Some(&definition));
        assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(35.));
    }
}

#[test]
fn updating_structured_formula_changes_all_rows_without_changing_header_or_totals() {
    let (mut book, mut history) = seed();
    history.set_table_totals_row(&mut book, "Orders", true).unwrap();
    history.clear("");
    let total = book.sheet(0).unwrap().get_formula("B5");
    history.set_cell_input(&mut book, 0, "B4", "=Orders[@Amount]*2").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "=Orders[@Amount]*3").unwrap();
    assert_eq!(values(&book), vec![Value::Number(30.), Value::Number(60.), Value::Number(90.)]);
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("Total".into()));
    assert_eq!(book.sheet(0).unwrap().get_formula("B5"), total);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(180.));
    assert_eq!(history.undo_count(), 2);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(120.));
    // 同一标准公式在另一行再次输入不能截断 redo。
    history.set_cell_input(&mut book, 0, "B3", "=Orders[@Amount]*2").unwrap();
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn ordinary_data_and_calculated_column_exceptions_are_not_overwritten() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "B4", Value::Number(99.));
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    assert_eq!(values(&book), vec![Value::Number(20.), Value::Null, Value::Number(99.)]);
    assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    let definition = book.get_table("Orders").unwrap().clone();
    history.set_cell_input(&mut book, 0, "B3", "99").unwrap();
    history.set_cell_input(&mut book, 0, "B2", "=A2*3").unwrap();
    assert_eq!(values(&book), vec![Value::Number(30.), Value::Number(99.), Value::Number(60.)]);
    assert_eq!(book.get_table("Orders"), Some(&definition));
}

#[test]
fn validation_failure_on_later_row_rolls_back_without_publishing_or_losing_redo() {
    let (mut book, mut history) = seed();
    let report = book.add_sheet("Report");
    book.set_formula(report, "A1", "=SUM(Orders[Total])");
    let hits = Rc::new(Cell::new(0));
    let observed = hits.clone();
    book.sheet_mut(report).unwrap().subscribe_cell("A1", move || observed.set(observed.get() + 1));
    book.sheet_mut(0).unwrap().set_data_validation(range("B4", "B4"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 0., max: 50. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    hits.set(0);
    let tables = book.snapshot_tables();
    assert!(history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap_err().contains("DATA_VALIDATION"));
    assert_eq!(values(&book), vec![Value::Null; 3]);
    assert_eq!(book.snapshot_tables(), tables);
    assert_eq!(book.get_cell("Report", "A1"), Value::Number(0.));
    assert_eq!(hits.get(), 0);
    assert_eq!(history.redo_count(), 1);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn cycles_and_spilled_arrays_reject_without_a_partial_column() {
    for formula in ["=B2+1", "=SEQUENCE(2)", "=SUM("] {
        let (mut book, mut history) = seed();
        let before = book.snapshot_tables();
        assert!(history.set_cell_input(&mut book, 0, "B2", formula).is_err(), "{formula}");
        assert_eq!(values(&book), vec![Value::Null; 3]);
        assert_eq!(book.snapshot_tables(), before);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn text_input_and_protected_sheet_policy_do_not_trigger_column_writes() {
    for input in ["'=A2*2", "42"] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "B2", input).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
        assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
    }
    let (mut book, mut history) = seed();
    book.sheet_mut(0).unwrap().patch_format_range(range("B2", "B2"), StyleScope::Cell,
        CellStyle { number_format: Some(NumberFormat::Text), ..Default::default() });
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Text("=A2*2".into()));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
    let (mut book, mut history) = seed();
    history.set_cell_input_with_table_expansion(&mut book, 0, "B2", "=A2*2", false).unwrap();
    assert_eq!(values(&book), vec![Value::Number(20.), Value::Null, Value::Null]);
    assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
}

#[test]
fn downstream_arrays_follow_last_row_changes_on_commit_undo_and_redo() {
    let (mut book, mut history) = seed();
    let report = book.add_sheet("Report");
    book.set_formula(report, "A1", "=SEQUENCE(2,1,Sheet1!B4)");
    book.set_formula(report, "D1", "=SUM(A1#)");
    assert_eq!(book.get_cell("Report", "D1"), Value::Number(1.));
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    assert_eq!(book.get_cell("Report", "D1"), Value::Number(121.));
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Report", "D1"), Value::Number(1.));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Report", "D1"), Value::Number(121.));
}

#[test]
fn new_row_inherits_master_formula_despite_existing_exceptions_and_undo_is_one_step() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    history.set_cell_input(&mut book, 0, "B3", "99").unwrap();
    let before = book.snapshot_tables();
    history.clear("");
    history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(80.));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(99.));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(80.));
}

#[test]
fn failed_inherited_formula_rolls_back_input_and_geometry_without_losing_redo() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    book.sheet_mut(0).unwrap().set_data_validation(range("B5", "B5"), Some(DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 0., max: 50. },
        ignore_blank: true, operator: Default::default(),
    })).unwrap();
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let before = book.snapshot_tables();
    assert!(history.set_cell_input(&mut book, 0, "A5", "40").is_err());
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(book.get_cell("Sheet1", "A5"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "B5"), Value::Null);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn inherited_formula_never_overwrites_new_row_data_or_the_explicit_input() {
    for explicit in [false, true] {
        let (mut book, mut history) = seed();
        history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
        if explicit {
            history.set_cell_input(&mut book, 0, "B5", "99").unwrap();
        } else {
            book.set_cell(0, "B5", Value::Number(99.));
            history.set_cell_input(&mut book, 0, "A5", "40").unwrap();
        }
        assert_eq!(book.get_cell("Sheet1", "B5"), Value::Number(99.));
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B5"));
    }
}

#[test]
fn blocked_array_formula_also_rejects_when_updating_an_existing_calculated_column() {
    let (mut book, mut history) = seed();
    history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap();
    let before = book.snapshot_tables();
    assert!(history.set_cell_input(&mut book, 0, "B2", "=SEQUENCE(2)").is_err());
    assert_eq!(values(&book), vec![Value::Number(20.), Value::Number(40.), Value::Number(60.)]);
    assert_eq!(book.snapshot_tables(), before);
    assert_eq!(history.undo_count(), 1);
}

#[test]
fn huge_empty_column_rejects_before_materializing_cells_or_consuming_redo() {
    let (mut book, mut history) = seed();
    history.resize_table(&mut book, "Orders", range("A1", "B1048576")).unwrap();
    history.set_cell_input(&mut book, 0, "D1", "7").unwrap();
    history.undo(&mut book).unwrap();
    let atoms = book.sheet(0).unwrap().debug_total_atom_count();
    assert!(history.set_cell_input(&mut book, 0, "B2", "=A2*2").unwrap_err().contains("undo budget"));
    assert_eq!(book.sheet(0).unwrap().debug_total_atom_count(), atoms);
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(history.redo_count(), 1);
}

#[test]
fn validation_checks_final_column_values_instead_of_partially_filled_dependencies() {
    for max in [3., 4.] {
        let (mut book, mut history) = seed();
        book.set_cell(0, "B5", Value::Number(1.));
        book.sheet_mut(0).unwrap().set_data_validation(range("B2", "B2"), Some(DataValidationRule {
            kind: DataValidationKind::WholeNumber { min: max, max },
            ignore_blank: true, operator: Default::default(),
        })).unwrap();
        let result = history.set_cell_input(&mut book, 0, "B2", "=B3+1");
        assert_eq!(result.is_ok(), max == 4.);
        if max == 4. {
            assert_eq!(values(&book), vec![Value::Number(4.), Value::Number(3.), Value::Number(2.)]);
        } else {
            assert_eq!(values(&book), vec![Value::Null; 3]);
            assert_eq!(history.undo_count(), 0);
            assert!(book.get_table("Orders").unwrap().calculated_columns().is_empty());
        }
    }
}

#[test]
fn changing_dependency_direction_does_not_treat_the_old_column_as_a_cycle() {
    let (mut book, mut history) = seed();
    book.set_cell(0, "B5", Value::Number(1.));
    history.set_cell_input(&mut book, 0, "B2", "=IF(ROW()=2,1,B1+1)").unwrap();
    assert_eq!(values(&book), vec![Value::Number(1.), Value::Number(2.), Value::Number(3.)]);
    history.set_cell_input(&mut book, 0, "B2", "=B3+1").unwrap();
    assert_eq!(values(&book), vec![Value::Number(4.), Value::Number(3.), Value::Number(2.)]);
    history.undo(&mut book).unwrap();
    assert_eq!(values(&book), vec![Value::Number(1.), Value::Number(2.), Value::Number(3.)]);
    history.redo(&mut book).unwrap();
    assert_eq!(values(&book), vec![Value::Number(4.), Value::Number(3.), Value::Number(2.)]);
}
