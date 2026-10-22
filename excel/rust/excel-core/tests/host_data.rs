use einfach_core::Value;
use einfach_excel_core::host::{read_range, HostCellInput, HostCellWrite, RawCellValue};
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(CellAddress::parse(a).unwrap(), CellAddress::parse(b).unwrap())
}
fn literal(sheet: usize, row: u32, col: u32, value: RawCellValue) -> HostCellWrite {
    HostCellWrite { sheet, row, col, input: HostCellInput::Literal { value } }
}
fn formula(sheet: usize, row: u32, col: u32, formula: &str) -> HostCellWrite {
    HostCellWrite { sheet, row, col, input: HostCellInput::Formula { formula: formula.into() } }
}
fn number(sheet: usize, row: u32, col: u32, value: f64) -> HostCellWrite {
    literal(sheet, row, col, RawCellValue::Number { value })
}

#[test]
fn host_typed_values_formulas_sparse_read_and_one_step_history() {
    let mut book = Workbook::new();
    book.add_sheet("Summary");
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "J1", "old history").unwrap();
    let values = [
        RawCellValue::Number { value: 1.2345678901234567 },
        RawCellValue::String { value: "00123".into() },
        RawCellValue::String { value: "=SUM(1,2)".into() },
        RawCellValue::String { value: "   ".into() },
        RawCellValue::Boolean { value: false },
        RawCellValue::String { value: String::new() },
        RawCellValue::Error { code: "#TYPE!".into() },
    ];
    let mut cells: Vec<_> = values.iter().enumerate()
        .map(|(col, value)| literal(0, 0, col as u32, value.clone())).collect();
    cells.push(literal(0, 2, 0, RawCellValue::Blank));
    cells.push(formula(1, 0, 0, "=Sheet1!A1+1"));
    assert!(history.write_host_cells(&mut book, &cells).unwrap());
    assert_eq!(history.undo_count(), 2);
    let before_read = history.mutation_sequence();
    let first = read_range(&book, 0, range("A1", "G3")).unwrap();
    assert_eq!(first.len(), values.len());
    for (cell, value) in first.iter().zip(&values) { assert_eq!(&cell.value, value); assert!(cell.formula.is_none()); }
    assert_eq!(first[1].input, "00123");
    assert_eq!(first[2].input, "=SUM(1,2)");
    let summary = read_range(&book, 1, range("A1", "C9")).unwrap();
    assert_eq!(summary[0].formula.as_deref(), Some("=Sheet1!A1+1"));
    assert_eq!(summary[0].value, RawCellValue::Number { value: 2.234567890123457 });
    assert_eq!(history.mutation_sequence(), before_read);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "J1"), Value::Text("old history".into()));
    assert_eq!(book.get_cell("Summary", "A1"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("00123".into()));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("=SUM(1,2)".into()));
}

#[test]
fn host_failure_rolls_back_earlier_writes_and_preserves_redo() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "A1", "7").unwrap();
    history.set_cell_input(&mut book, 0, "A1", "8").unwrap();
    history.undo(&mut book).unwrap();
    let sequence = history.mutation_sequence();
    assert!(history.write_host_cells(&mut book, &[
        number(0, 0, 0, 99.), formula(0, 1, 0, "=A2"),
    ]).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!((history.undo_count(), history.redo_count()), (1, 1));
    assert_eq!(history.mutation_sequence(), sequence);
    assert!(!history.write_host_cells(&mut book, &[number(0, 0, 0, 7.)]).unwrap());
    assert_eq!(history.mutation_sequence(), sequence);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(8.));
}

#[test]
fn host_rejects_protection_boundary_duplicate_invalid_type_and_budget_before_writes() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.change_protection(0, ProtectionChange::AllowRange { range: range("A1", "A1").into() }).unwrap();
    book.change_protection(0, ProtectionChange::Protect).unwrap();
    assert!(history.write_host_cells(&mut book, &[number(0, 0, 0, 5.), number(0, 1, 0, 6.)]).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    book.change_protection(0, ProtectionChange::Unprotect).unwrap();
    for writes in [
        vec![number(0, 0, 0, 1.), number(0, 1_048_576, 0, 2.)],
        vec![number(0, 0, 0, 1.), number(0, 0, 0, 2.)],
        vec![number(0, 0, 0, f64::NAN)],
        vec![literal(0, 0, 0, RawCellValue::Error { code: "invented".into() })],
        vec![literal(0, 0, 0, RawCellValue::String { value: "a".repeat(4 * 1024 * 1024) })],
    ] { assert!(history.write_host_cells(&mut book, &writes).is_err()); }
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.mutation_sequence(), 0);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Null);
    assert!(read_range(&book, 9, range("A1", "A1")).is_err());
    assert!(read_range(&book, 0, CellRange::single(CellAddress::new(0, 16_384))).is_err());
}

#[test]
fn host_omits_spill_children_and_rejects_existing_array_targets_atomically() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    assert!(history.write_host_cells(&mut book, &[formula(0, 0, 0, "=SEQUENCE(3)")]).unwrap());
    let cells = read_range(&book, 0, range("A1", "B5")).unwrap();
    assert_eq!(cells.len(), 1);
    assert_eq!(cells[0].formula.as_deref(), Some("=SEQUENCE(3)"));
    assert!(history.write_host_cells(&mut book, &[number(0, 0, 1, 9.), number(0, 1, 0, 8.)]).is_err());
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(2.));
}

#[test]
fn host_validation_rejection_restores_dependencies_without_publishing_candidate_values() {
    use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
    use std::{cell::Cell, rc::Rc};
    let mut book = Workbook::new();
    book.add_sheet("Audit");
    book.set_cell(0, "A1", Value::Number(1.));
    book.set_formula(0, "C1", "=SEQUENCE(A1)");
    book.set_formula(1, "E1", "=SUM(Sheet1!C1:C3)");
    book.sheet_mut(0).unwrap().set_data_validation(range("A2", "A2"), Some(DataValidationRule {
        kind: DataValidationKind::CustomFormula { formula: "=FALSE".into(), anchor: CellAddress::new(1, 0) },
        ignore_blank: false, operator: Default::default(), options: Default::default(),
    })).unwrap();
    let mut observed = Vec::new();
    for (sheet, address) in [(0, "A1"), (0, "C2"), (0, "C3"), (1, "E1")] {
        let hits = Rc::new(Cell::new(0));
        let counter = hits.clone();
        book.sheet_mut(sheet).unwrap().subscribe_cell(address, move || counter.set(counter.get() + 1));
        observed.push(hits);
    }
    let mut history = WorkbookHistory::default();
    assert!(history.write_host_cells(&mut book, &[number(0, 0, 0, 3.), number(0, 1, 0, 4.)]).is_err());
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.));
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
    assert_eq!(book.get_cell("Audit", "E1"), Value::Number(1.));
    assert!(observed.iter().all(|hits| hits.get() == 0));
    assert_eq!(history.mutation_sequence(), 0);
    assert_eq!(history.undo_count(), 0);
}

#[test]
fn host_rejects_table_merge_covered_targets_and_read_overflow_explicitly() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Amount".into()));
    book.define_table(Some("Inventory"), 0, range("A1", "A3"), true).unwrap();
    book.merge_cells(0, range("C1", "D1"), einfach_excel_core::MergeAction::Merge, false).unwrap();
    let mut history = WorkbookHistory::default();
    for (row, col) in [(1, 0), (0, 3)] {
        assert_eq!(history.write_host_cells(&mut book, &[number(0, 8, 8, 1.), number(0, row, col, 2.)]),
            Err("HOST_COMPLEX_TARGET_UNSUPPORTED"));
        assert_eq!(book.get_cell("Sheet1", "I9"), Value::Null);
    }
    assert_eq!(history.mutation_sequence(), 0);
    for row in 0..4097 { book.set_cell(0, &CellAddress::new(row, 10).to_string(), Value::Number(1.)); }
    assert_eq!(read_range(&book, 0, range("K1", "K4097")).unwrap_err(), "HOST_READ_BUDGET_EXCEEDED");
    book.set_formula(0, "M1", "=LAMBDA(x,x+1)");
    assert_eq!(read_range(&book, 0, range("M1", "M1")).unwrap()[0].value,
        RawCellValue::Error { code: "#CALC!".into() });
}
