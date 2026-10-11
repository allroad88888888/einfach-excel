//! 数据验证校验真实粘贴计划，任何拒绝都不能留下部分数据或消耗 redo。
use einfach_core::Value;
use einfach_excel_core::clipboard::{
    ClipboardArithmetic as Op, ClipboardPasteMode as Mode, ClipboardPasteOptions, ClipboardSnapshot,
};
use einfach_excel_core::data_validation::{DataValidationKind as Kind, DataValidationRule as Rule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use std::{cell::Cell, rc::Rc};

fn range(first: &str, last: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(first).unwrap(),
        CellAddress::parse(last).unwrap(),
    )
}

fn rule(book: &mut Workbook, first: &str, last: &str, ignore_blank: bool) {
    book.sheet_mut(0)
        .unwrap()
        .set_data_validation(
            range(first, last),
            Some(Rule {
                kind: Kind::WholeNumber {
                    min: 0.0,
                    max: 10.0,
                },
                ignore_blank,
            }),
        )
        .unwrap();
}

#[test]
fn invalid_last_cell_rejects_all_value_paste_modes_without_changing_history() {
    for mode in [
        Mode::Values,
        Mode::ValuesAndFormats,
        Mode::ValuesAndNumberFormats,
    ] {
        let mut book = Workbook::new();
        book.set_cell_input(0, "A1", "4").unwrap();
        book.set_cell_input(0, "B1", "11").unwrap();
        book.set_cell_input(0, "D1", "7").unwrap();
        book.set_cell_input(0, "E1", "8").unwrap();
        rule(&mut book, "D1", "E1", true);
        let clip = book.capture_clipboard(0, range("A1", "B1"), false).unwrap();
        let options = ClipboardPasteOptions {
            mode,
            ..ClipboardPasteOptions::new(range("D1", "D1"))
        };
        let mut history = WorkbookHistory::default();
        let before = book
            .sheet(0)
            .unwrap()
            .snapshot_format_range(range("D1", "E1"));
        assert_eq!(
            book.paste_clipboard_with_history(&clip, 0, &options, &mut history),
            Err("DATA_VALIDATION_FAILED")
        );
        assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(7.0));
        assert_eq!(book.get_cell("Sheet1", "E1"), Value::Number(8.0));
        assert_eq!(
            book.sheet(0)
                .unwrap()
                .snapshot_format_range(range("D1", "E1")),
            before
        );
        assert_eq!(history.undo_count(), 0);
        assert!(!history.is_pending());
    }
}

#[test]
fn transpose_tiling_and_skip_blanks_validate_actual_target_cells() {
    let mut book = Workbook::new();
    rule(&mut book, "C1", "F2", false);
    book.set_cell(0, "C1", Value::Number(7.0));
    let clip = ClipboardSnapshot::from_tsv("\t2\n3\t4", Mode::All).unwrap();
    let mut options = ClipboardPasteOptions {
        mode: Mode::Values,
        transpose: true,
        skip_blanks: true,
        ..ClipboardPasteOptions::new(range("C1", "F2"))
    };
    book.paste_clipboard(&clip, 0, &options).unwrap();
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(7.0));
    assert_eq!(book.get_cell("Sheet1", "D1"), Value::Number(3.0));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(2.0));
    assert_eq!(book.get_cell("Sheet1", "F2"), Value::Number(4.0));
    options.skip_blanks = false;
    assert_eq!(
        book.paste_clipboard(&clip, 0, &options),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(7.0));
}

#[test]
fn arithmetic_checks_the_result_instead_of_the_copied_number() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "9").unwrap();
    rule(&mut book, "A1", "A1", true);
    let clip = ClipboardSnapshot::from_tsv("2", Mode::All).unwrap();
    let options = ClipboardPasteOptions {
        mode: Mode::Values,
        arithmetic: Op::Add,
        ..ClipboardPasteOptions::new(range("A1", "A1"))
    };
    assert_eq!(
        book.paste_clipboard(&clip, 0, &options),
        Err("DATA_VALIDATION_FAILED")
    );
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(9.0));
}

#[test]
fn formula_arithmetic_checks_the_final_batch_and_rolls_back_cross_sheet_notifications() {
    for recorded in [false, true] {
        let mut book = Workbook::new();
        book.set_cell_input(0, "B1", "1").unwrap();
        book.set_formula(0, "A1", "=B1");
        let other = book.add_sheet("Other");
        book.set_formula(other, "A1", "=Sheet1!A1*2");
        rule(&mut book, "A1", "A1", true);
        let calls = Rc::new(Cell::new(0));
        for sheet in [0, other] {
            let observed = calls.clone();
            book.sheet_mut(sheet)
                .unwrap()
                .subscribe_cell("A1", move || observed.set(observed.get() + 1));
        }
        calls.set(0);
        // A1 自己加零，但同批 B1 加二十；不能拿写入前的公式结果 1 来校验。
        let clip = ClipboardSnapshot::from_tsv("0\t20", Mode::All).unwrap();
        let options = ClipboardPasteOptions {
            mode: Mode::Values,
            arithmetic: Op::Add,
            ..ClipboardPasteOptions::new(range("A1", "B1"))
        };
        let mut history = WorkbookHistory::default();
        let result = if recorded {
            book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        } else {
            book.paste_clipboard(&clip, 0, &options)
        };
        assert_eq!(result, Err("DATA_VALIDATION_FAILED"));
        assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(1.0));
        assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(1.0));
        assert_eq!(book.get_cell("Other", "A1"), Value::Number(2.0));
        assert_eq!(
            book.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=B1")
        );
        assert_eq!(calls.get(), 0);
        assert_eq!(history.undo_count(), 0);
        assert!(!history.is_pending());
    }
}

#[test]
fn valid_formula_paste_is_one_history_step_and_rejected_retry_keeps_redo() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=2");
    rule(&mut book, "A1", "A1", true);
    let mut history = WorkbookHistory::default();
    let options = ClipboardPasteOptions {
        mode: Mode::Values,
        arithmetic: Op::Add,
        ..ClipboardPasteOptions::new(range("A1", "A1"))
    };
    let clip = ClipboardSnapshot::from_tsv("3", Mode::All).unwrap();
    book.paste_clipboard_with_history(&clip, 0, &options, &mut history)
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(5.0));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    let invalid = ClipboardSnapshot::from_tsv("20", Mode::All).unwrap();
    assert!(book
        .paste_clipboard_with_history(&invalid, 0, &options, &mut history)
        .is_err());
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(5.0));
}

#[test]
fn ordinary_paste_does_not_treat_validation_as_a_database_constraint() {
    let mut book = Workbook::new();
    rule(&mut book, "A1", "A1", true);
    let clip = ClipboardSnapshot::from_tsv("20", Mode::All).unwrap();
    book.paste_clipboard(&clip, 0, &ClipboardPasteOptions::new(range("A1", "A1")))
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Number(20.0));
    assert_eq!(
        book.set_cell_input(0, "A1", "21"),
        Err("DATA_VALIDATION_FAILED")
    );
}
