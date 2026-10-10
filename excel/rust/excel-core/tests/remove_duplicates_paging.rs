//! 分页只改变返回的样本，不能改变完整扫描、首条记录或提交范围。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_remove_duplicates::{DuplicateComparison, RemoveDuplicatesRequest};

fn setup() -> (Workbook, RemoveDuplicatesRequest) {
    let mut wb = Workbook::new();
    for row in 0..46 {
        wb.set_cell(0, &format!("A{}", row + 1), Value::Text(format!("Key{}", row % 3)));
        wb.set_cell(0, &format!("B{}", row + 1), Value::Number(row as f64));
    }
    (wb, RemoveDuplicatesRequest { sheet: 0,
        range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(45, 1)),
        columns: vec![0], has_header: false, comparison: DuplicateComparison::Exact,
        row_count: 100, col_count: 8 })
}

#[test]
fn pages_cover_every_duplicate_once_and_first_occurrences_stay_global() {
    let (wb, req) = setup();
    let mut rows = Vec::new();
    for offset in [0, 20, 40] {
        let page = wb.preview_remove_duplicates_page(&req, offset).unwrap();
        assert_eq!((page.scanned_rows, page.removed_rows, page.unique_rows), (46, 43, 3));
        assert_eq!(page.sample_offset, offset);
        assert_eq!(page.sample.len(), if offset == 40 { 3 } else { 20 });
        for sample in page.sample {
            assert_eq!(sample.first_row, sample.row % 3);
            assert_eq!(sample.values[1], sample.row.to_string());
            rows.push(sample.row);
        }
    }
    assert_eq!(rows, (3..46).collect::<Vec<_>>());
    assert_eq!(wb.get_cell("Sheet1", "B46"), Value::Number(45.0));
}

#[test]
fn filtered_rows_do_not_consume_page_slots_and_header_is_not_a_first_occurrence() {
    let (mut wb, mut req) = setup();
    req.has_header = true;
    wb.set_eval_filter_hidden_rows(0, &[4, 7, 10]);
    let page = wb.preview_remove_duplicates_page(&req, 20).unwrap();
    assert_eq!((page.scanned_rows, page.excluded_rows, page.removed_rows), (42, 3, 39));
    assert_eq!(page.sample.len(), 19);
    assert_eq!(page.sample[0].row, 27);
    assert_eq!(page.sample[0].first_row, 3);
}

#[test]
fn invalid_pages_are_read_only_and_last_page_never_limits_application() {
    let (mut wb, req) = setup();
    let mut history = WorkbookHistory::default();
    for offset in [43, 100_001, usize::MAX] {
        assert!(wb.preview_remove_duplicates_page(&req, offset).is_err());
        assert_eq!(wb.get_cell("Sheet1", "B46"), Value::Number(45.0));
        assert_eq!(history.undo_count(), 0);
    }
    wb.preview_remove_duplicates_page(&req, 40).unwrap();
    assert_eq!(history.remove_duplicates(&mut wb, &req).unwrap().removed_rows, 43);
    assert_eq!(history.undo_count(), 1);
    assert_eq!(wb.get_cell("Sheet1", "B46"), Value::Null);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B46"), Value::Number(45.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Null);
}

#[test]
fn empty_results_accept_only_the_first_page() {
    let (wb, mut req) = setup();
    req.columns = vec![1];
    let page = wb.preview_remove_duplicates_page(&req, 0).unwrap();
    assert_eq!((page.sample_offset, page.removed_rows), (0, 0));
    assert!(page.sample.is_empty());
    assert!(wb.preview_remove_duplicates_page(&req, 20).is_err());
}
