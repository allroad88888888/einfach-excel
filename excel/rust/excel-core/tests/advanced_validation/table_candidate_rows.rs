//! Table 新行/空表首行的自定义条件须看到整行继承结果，失败不消费历史。
use super::*;
use einfach_excel_core::{TableColumnFormula, TableEntry, TableRegistrySnapshot};
use std::{cell::Cell, rc::Rc};

fn seed(empty: bool) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    let table = if empty {
        TableEntry::from_parts(
            "Orders",
            "Sheet1",
            range("A3", "B3"),
            false,
            false,
            vec!["Qty".into(), "Amount".into()],
        )
        .with_insert_row(true)
        .with_calculated_columns(vec![
            None,
            Some(TableColumnFormula::new(2, "=A3*2").unwrap()),
        ])
    } else {
        book.set_cell(0, "A1", Value::Text("Qty".into()));
        book.set_cell(0, "B1", Value::Text("Amount".into()));
        book.set_cell(0, "A2", Value::Number(1.));
        book.set_formula(0, "B2", "=A2*2");
        TableEntry::from_parts(
            "Orders",
            "Sheet1",
            range("A1", "B2"),
            true,
            false,
            vec!["Qty".into(), "Amount".into()],
        )
        .with_calculated_columns(vec![
            None,
            Some(TableColumnFormula::new(1, "=A2*2").unwrap()),
        ])
    };
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![table]))
        .unwrap();
    let other = book.add_sheet("Other");
    book.set_formula(other, "E1", "=SUM(Orders[Amount])");
    install(
        &mut book,
        range("A3", "A3"),
        formula("=AND(B3=A3*2,A3<3)", "A3"),
    );
    (book, WorkbookHistory::default())
}

#[test]
fn literal_and_formatted_number_validate_after_new_or_first_row_is_complete() {
    for empty in [false, true] {
        for input in ["2", "200%"] {
            let (mut book, mut history) = seed(empty);
            let before = book.snapshot_tables();
            history.set_cell_input(&mut book, 0, "A3", input).unwrap();
            let after = book.snapshot_tables();
            for _ in 0..2 {
                assert_eq!(history.undo_count(), 1);
                assert!(!book.get_table("Orders").unwrap().has_insert_row());
                assert_eq!(book.get_cell("Sheet1", "A3"), Value::Number(2.));
                assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(4.));
                assert_eq!(
                    book.get_cell("Other", "E1"),
                    Value::Number(if empty { 4. } else { 6. })
                );
                history.undo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), before);
                assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
                assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
                history.redo(&mut book).unwrap();
                assert_eq!(book.snapshot_tables(), after);
            }
        }
    }
}

#[test]
fn failed_completed_row_restores_cells_geometry_subscribers_and_existing_redo() {
    for empty in [false, true] {
        for input in ["3", "300%"] {
            let (mut book, mut history) = seed(empty);
            history.set_cell_input(&mut book, 0, "F1", "9").unwrap();
            history.undo(&mut book).unwrap();
            let before = book.snapshot_tables();
            let old_report = book.get_cell("Other", "E1");
            let hits = Rc::new(Cell::new(0));
            for (sheet, address) in [(0, "A3"), (0, "B3"), (1, "E1")] {
                let observed = hits.clone();
                book.sheet_mut(sheet)
                    .unwrap()
                    .subscribe_cell(address, move || observed.set(observed.get() + 1));
            }
            assert_eq!(
                history.set_cell_input(&mut book, 0, "A3", input),
                Err("DATA_VALIDATION_FAILED".into())
            );
            assert_eq!(book.snapshot_tables(), before);
            assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
            assert_eq!(book.get_cell("Sheet1", "B3"), Value::Null);
            assert_eq!(book.get_cell("Sheet1", "C3"), Value::Null);
            assert_eq!(book.get_cell("Other", "E1"), old_report);
            assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
            assert_eq!(hits.get(), 0);
            history.redo(&mut book).unwrap();
            assert_eq!(book.get_cell("Sheet1", "F1"), Value::Number(9.));
        }
    }
}
