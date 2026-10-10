use einfach_core::Value;
use einfach_excel_core::clipboard::ClipboardPasteOptions;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellFormat, CellRange, ColumnFilterRule, MergeAction, Workbook,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn fixture() -> Workbook {
    let mut book = Workbook::new();
    for (row, team) in [(2, "West"), (3, "East"), (4, "West"), (5, "East")] {
        book.set_cell(0, &format!("A{row}"), Value::Text(team.into()));
        book.set_cell(0, &format!("B{row}"), Value::Number(row as f64));
        book.set_formula(0, &format!("C{row}"), &format!("=B{row}+$B$1"));
    }
    book.set_cell(0, "B1", Value::Number(10.0));
    book.sheet_mut(0).unwrap().set_format(
        "C4",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    book.hide_rows(0, &[3]);
    filter(&mut book);
    book
}
fn filter(book: &mut Workbook) {
    book.apply_filter(
        0,
        &[ColumnFilterRule::Equals {
            col_index: 0,
            value: "West".into(),
            case_sensitive: false,
        }],
    )
    .unwrap();
}
fn formula(book: &Workbook, address: &str) -> String {
    book.sheet(0)
        .unwrap()
        .formula_text_at(CellAddress::parse(address).unwrap())
        .unwrap()
}

#[test]
fn copy_compacts_only_filtered_rows_and_freezes_source_origins_for_formula_history() {
    let mut book = fixture();
    let snapshot = book.capture_clipboard(0, range("B2", "C5"), false).unwrap();
    assert_eq!((snapshot.rows(), snapshot.cols()), (2, 2));
    assert_eq!(snapshot.text(), "2\t12\n4\t14");
    book.clear_filter(0).unwrap();
    book.set_cell(0, "B4", Value::Number(99.0));
    let mut history = WorkbookHistory::default();
    let target = book
        .paste_clipboard_with_history(
            &snapshot,
            0,
            &ClipboardPasteOptions::new(range("E10", "E10")),
            &mut history,
        )
        .unwrap();
    assert_eq!(target, range("E10", "F11"));
    assert_eq!(book.get_cell("Sheet1", "E11"), Value::Number(4.0));
    assert_eq!(formula(&book, "F10"), "=(E10+$B$1)");
    assert_eq!(formula(&book, "F11"), "=(E11+$B$1)");
    assert!(book.sheet(0).unwrap().effective_format("F11").bold);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "F11"), Value::Null);
    history.redo(&mut book).unwrap();
    assert_eq!(formula(&book, "F11"), "=(E11+$B$1)");
}

#[test]
fn transposed_and_tiled_formulas_use_each_original_row_not_the_compressed_index() {
    let mut book = fixture();
    let snapshot = book.capture_clipboard(0, range("C2", "C5"), false).unwrap();
    let mut options = ClipboardPasteOptions::new(range("E10", "H10"));
    options.transpose = true;
    book.paste_clipboard(&snapshot, 0, &options).unwrap();
    for (target, expected) in [
        ("E10", "=(D10+$B$1)"),
        ("F10", "=(E10+$B$1)"),
        ("G10", "=(F10+$B$1)"),
        ("H10", "=(G10+$B$1)"),
    ] {
        assert_eq!(formula(&book, target), expected);
    }
}

#[test]
fn all_filtered_copy_and_filtered_cut_reject_without_touching_cells() {
    let mut book = fixture();
    assert_eq!(
        book.capture_clipboard(0, range("B3", "C3"), false)
            .unwrap_err(),
        "CLIPBOARD_NO_VISIBLE_ROWS"
    );
    assert_eq!(
        book.capture_clipboard(0, range("B2", "C5"), true)
            .unwrap_err(),
        "CLIPBOARD_FILTERED_CUT"
    );
    book.clear_filter(0).unwrap();
    let cut = book.capture_clipboard(0, range("B2", "B5"), true).unwrap();
    filter(&mut book);
    assert_eq!(
        book.paste_clipboard(&cut, 0, &ClipboardPasteOptions::new(range("E10", "E10"))),
        Err("CLIPBOARD_FILTERED_CUT")
    );
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(3.0));
    assert_eq!(book.get_cell("Sheet1", "E10"), Value::Null);
}

#[test]
fn fully_visible_merges_move_by_compacted_offset_and_partial_visible_merges_reject() {
    let mut book = fixture();
    book.merge_cells(0, range("D4", "E4"), MergeAction::Merge, false)
        .unwrap();
    book.set_cell(0, "D4", Value::Text("merged".into()));
    let snapshot = book.capture_clipboard(0, range("D2", "E5"), false).unwrap();
    book.paste_clipboard(
        &snapshot,
        0,
        &ClipboardPasteOptions::new(range("G10", "G10")),
    )
    .unwrap();
    assert!(book
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("G11", "H11")));
    assert_eq!(book.get_cell("Sheet1", "G11"), Value::Text("merged".into()));
    book.merge_cells(0, range("F2", "F3"), MergeAction::Merge, false)
        .unwrap();
    assert_eq!(
        book.capture_clipboard(0, range("F2", "F4"), false)
            .unwrap_err(),
        "CLIPBOARD_PARTIAL_MERGE"
    );
    // 完全不可见的合并块不进入复制内容，也不阻塞其它可见行。
    book.merge_cells(0, range("H3", "I3"), MergeAction::Merge, false)
        .unwrap();
    assert_eq!(
        book.capture_clipboard(0, range("H2", "H4"), false)
            .unwrap()
            .rows(),
        2
    );
}

#[test]
fn one_remaining_visible_cell_can_paste_into_a_merged_target_as_one_logical_cell() {
    let mut book = fixture();
    let snapshot = book.capture_clipboard(0, range("B3", "B4"), false).unwrap();
    book.merge_cells(0, range("E10", "F11"), MergeAction::Merge, false)
        .unwrap();
    book.paste_clipboard(
        &snapshot,
        0,
        &ClipboardPasteOptions::new(range("E10", "F11")),
    )
    .unwrap();
    assert_eq!(book.get_cell("Sheet1", "E10"), Value::Number(4.0));
    assert!(book
        .sheet(0)
        .unwrap()
        .merged_ranges()
        .contains(&range("E10", "F11")));
}
