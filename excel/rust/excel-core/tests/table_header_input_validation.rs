//! 表头的文字输入也受验证约束；自动扩列必须先检查最终规范化列名。
use einfach_core::Value;
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}

fn seed(address: &str, allowed: &str) -> (Workbook, WorkbookHistory) {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Item".into()));
    book.set_cell(0, "B1", Value::Text("Amount".into()));
    book.set_cell(0, "B2", Value::Number(10.));
    book.define_table(Some("Orders"), 0, range("A1", "B2"), true)
        .unwrap();
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(
            range(address, address),
            Some(DataValidationRule {
                options: Default::default(), kind: DataValidationKind::List {
                    items: vec![allowed.into()],
                },
                ignore_blank: true,
                operator: Default::default(),
            }),
        )
        .unwrap();
    let mut history = WorkbookHistory::default();
    history.set_cell_input(&mut book, 0, "B2", "20").unwrap();
    history.undo(&mut book).unwrap();
    (book, history)
}

#[test]
fn rejected_existing_and_expanding_headers_preserve_values_geometry_and_redo() {
    for address in ["B1", "C1"] {
        let (mut book, mut history) = seed(address, "Approved");
        let original = book.get_cell("Sheet1", address);
        assert_eq!(
            history
                .set_cell_input(&mut book, 0, address, "Rejected")
                .unwrap_err(),
            "DATA_VALIDATION_FAILED"
        );
        assert_eq!(book.get_cell("Sheet1", address), original);
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B2"));
        assert_eq!(
            book.get_table("Orders").unwrap().columns(),
            &["Item", "Amount"]
        );
        assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
        history.redo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(20.));
    }
}

#[test]
fn accepted_normalized_header_has_one_undo_step() {
    for address in ["B1", "C1"] {
        let (mut book, mut history) = seed(address, "Approved");
        let original = book.get_cell("Sheet1", address);
        history
            .set_cell_input(&mut book, 0, address, "' Approved ")
            .unwrap();
        assert_eq!(
            book.get_cell("Sheet1", address),
            Value::Text("Approved".into())
        );
        assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
        history.undo(&mut book).unwrap();
        assert_eq!(book.get_cell("Sheet1", address), original);
        assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B2"));
        history.redo(&mut book).unwrap();
        assert_eq!(
            book.get_cell("Sheet1", address),
            Value::Text("Approved".into())
        );
    }
}

#[test]
fn expanding_header_validates_the_deduplicated_name_not_the_raw_input() {
    let (mut book, mut history) = seed("C1", "Amount");
    assert_eq!(
        history
            .set_cell_input(&mut book, 0, "C1", "Amount")
            .unwrap_err(),
        "DATA_VALIDATION_FAILED"
    );
    assert_eq!(book.get_table("Orders").unwrap().range(), range("A1", "B2"));
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    let (mut book, mut history) = seed("C1", "Column1");
    history
        .set_cell_input(&mut book, 0, "C1", "Amount")
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("Column1".into()));
    assert_eq!((history.undo_count(), history.redo_count()), (1, 0));
}
