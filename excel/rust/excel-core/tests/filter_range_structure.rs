use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};

fn r(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}

#[test]
fn structural_edits_displace_range_and_rule_column_without_rescanning_and_undo_restores_both() {
    for (edit, expected, column, hidden) in [
        (
            ShiftEdit::RowInsert { at: 1, count: 2 },
            Some(r("B5", "D8")),
            1,
            vec![6],
        ),
        (
            ShiftEdit::RowInsert { at: 4, count: 1 },
            Some(r("B3", "D7")),
            1,
            vec![5],
        ),
        (
            ShiftEdit::RowDelete { at: 3, count: 1 },
            Some(r("B3", "D5")),
            1,
            vec![3],
        ),
        (
            ShiftEdit::ColInsert { at: 0, count: 1 },
            Some(r("C3", "E6")),
            2,
            vec![4],
        ),
        (
            ShiftEdit::ColDelete { at: 0, count: 1 },
            Some(r("A3", "C6")),
            0,
            vec![4],
        ),
        (ShiftEdit::RowDelete { at: 2, count: 1 }, None, 1, vec![]),
        (ShiftEdit::RowDelete { at: 3, count: 3 }, None, 1, vec![]),
        (ShiftEdit::ColDelete { at: 1, count: 3 }, None, 1, vec![]),
    ] {
        let mut book = Workbook::new();
        for (address, value) in [("B4", "West"), ("B5", "East"), ("B6", "West")] {
            book.set_cell(0, address, Value::Text(value.into()));
        }
        book.apply_filter_range(
            0,
            r("B3", "D6"),
            &[ColumnFilterRule::Equals {
                col_index: 1,
                value: "West".into(),
                case_sensitive: false,
            }],
        )
        .unwrap();
        let before = book.snapshot_filters();
        let scans = book.debug_filter_scan_count(0);
        let mut history = WorkbookHistory::default();
        history.edit_structure(&mut book, 0, edit).unwrap();
        assert_eq!(book.filter_range(0), expected);
        assert_eq!(book.filter_hidden_rows(0), hidden);
        if expected.is_some() {
            assert_eq!(book.filter_rules(0)[0].col_index(), column);
        }
        let after = book.snapshot_filters();
        history.undo(&mut book).unwrap();
        assert_eq!(book.snapshot_filters(), before);
        history.redo(&mut book).unwrap();
        assert_eq!(book.snapshot_filters(), after);
        assert_eq!(book.debug_filter_scan_count(0), scans);
    }
}

#[test]
fn deleting_the_only_condition_column_keeps_surviving_header_buttons_but_releases_rows() {
    let mut book = Workbook::new();
    book.apply_filter_range(
        0,
        r("B3", "D6"),
        &[ColumnFilterRule::Equals {
            col_index: 1,
            value: "West".into(),
            case_sensitive: false,
        }],
    )
    .unwrap();
    book.try_structural_edit(0, ShiftEdit::ColDelete { at: 1, count: 1 })
        .unwrap();
    assert_eq!(book.filter_range(0), Some(r("B3", "C6")));
    assert!(book.filter_rules(0).is_empty());
    assert!(book.filter_hidden_rows(0).is_empty());
}

#[test]
fn empty_filter_extent_cannot_be_silently_truncated_by_an_insertion() {
    let mut book = Workbook::new();
    book.apply_filter_range(0, r("A1048575", "B1048576"), &[])
        .unwrap();
    assert!(book
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(book.filter_range(0), Some(r("A1048575", "B1048576")));
}
