use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellRange, ColumnFilterRule, SortDirection, SortKey, Workbook,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn fixture() -> Workbook {
    let mut book = Workbook::new();
    for (row, team, value) in [(2, "West", 30.0), (3, "East", 99.0), (4, "West", 10.0)] {
        book.set_cell(0, &format!("A{row}"), Value::Text(team.into()));
        book.set_cell(0, &format!("B{row}"), Value::Number(value));
    }
    book.hide_rows(0, &[3]);
    book.apply_filter(
        0,
        &[ColumnFilterRule::Equals {
            col_index: 0,
            value: "West".into(),
            case_sensitive: false,
        }],
    )
    .unwrap();
    book
}

#[test]
fn sort_includes_manual_hidden_but_never_moves_filtered_rows_and_undo_preserves_filter() {
    let mut book = fixture();
    let mut history = WorkbookHistory::default();
    let target = range("A2", "B4");
    history
        .begin(&book, 0, target, "Sort selection", true)
        .unwrap();
    let report = book
        .sort_range(
            0,
            target,
            &[SortKey {
                col: 1,
                direction: SortDirection::Ascending,
                case_sensitive: false,
            }],
            &[],
        )
        .unwrap();
    history.finish(&mut book, true).unwrap();
    assert_eq!(report.row_permutation, vec![(1, 3), (3, 1)]);
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(10.0));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(99.0));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(30.0));
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    assert_eq!(book.list_hidden_rows(0), vec![3]);
    history.undo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(30.0));
    assert_eq!(book.filter_hidden_rows(0), vec![2]);
    history.redo(&mut book).unwrap();
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(10.0));
    // 宿主额外排除一个可见行时，只剩一个位置，不能制造数据移动。
    let report = book
        .sort_range(
            0,
            target,
            &[SortKey {
                col: 1,
                direction: SortDirection::Descending,
                case_sensitive: false,
            }],
            &[1],
        )
        .unwrap();
    assert_eq!(report.moved_rows, 0);
}

#[test]
fn all_six_statistics_skip_only_filter_hidden_rows_deduplicate_and_refresh_after_clear() {
    let mut book = fixture();
    let targets = [(0, range("A2", "B4")), (0, range("B2", "B4"))];
    let stats = book.aggregate_selection(&targets).unwrap();
    assert_eq!((stats.count, stats.numeric_count), (4, 2));
    assert_eq!(
        (stats.sum, stats.average, stats.min, stats.max),
        (Some(40.0), Some(20.0), Some(10.0), Some(30.0))
    );
    let empty = book.aggregate_selection(&[(0, range("A3", "B3"))]).unwrap();
    assert_eq!((empty.count, empty.numeric_count, empty.sum), (0, 0, None));
    book.add_sheet("Other");
    book.set_cell(1, "B3", Value::Number(2.0));
    assert_eq!(
        book.aggregate_selection(&[(0, range("B2", "B4")), (1, range("B2", "B4"))])
            .unwrap()
            .sum,
        Some(42.0)
    );
    book.clear_filter(0).unwrap();
    assert_eq!(book.aggregate_selection(&targets).unwrap().sum, Some(139.0));
}
