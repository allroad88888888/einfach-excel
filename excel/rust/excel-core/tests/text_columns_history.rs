//! 分列提交的原子性、覆盖门禁、历史及数据保护。
use einfach_core::Value;
use einfach_excel_core::text_columns::TextColumnsMode;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, MergeAction, Workbook};

fn request(start: &str, end: &str, destination: &str) -> TextColumnsRequest {
    TextColumnsRequest {
        sheet: 0,
        column_types: vec![],
        number_options: None,
        row_count: 1_048_576,
        col_count: 16_384,
        source: CellRange::new(
            CellAddress::parse(start).unwrap(),
            CellAddress::parse(end).unwrap(),
        ),
        destination: CellAddress::parse(destination).unwrap(),
        mode: TextColumnsMode::Delimited {
            delimiters: vec![','],
            merge_consecutive: false,
            qualifier: Some('"'),
        },
    }
}

#[test]
fn shifted_overlap_freezes_source_and_undo_redo_are_each_one_step() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("first,001".into()));
    wb.set_cell(0, "A2", Value::Text("second,=1+2".into()));
    wb.set_cell(0, "B3", Value::Number(42.0));
    wb.sheet_mut(0).unwrap().set_format(
        "B3",
        CellFormat {
            italic: true,
            ..Default::default()
        },
    );
    let format = wb.sheet(0).unwrap().effective_format("B3");
    let req = request("A1", "A2", "A2");
    assert_eq!(
        history.split_text_columns(&mut wb, &req, false),
        Err("TEXT_COLUMNS_OVERWRITE_CONFIRMATION_REQUIRED")
    );
    assert_eq!(history.undo_count(), 0);
    history.split_text_columns(&mut wb, &req, true).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("first".into()));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("second".into()));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Text("001".into()));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Text("=1+2".into()));
    assert_eq!(wb.sheet(0).unwrap().get_formula("B3"), None);
    assert_eq!(wb.sheet(0).unwrap().effective_format("B3"), format);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "A2"),
        Value::Text("second,=1+2".into())
    );
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(42.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("second".into()));
    assert_eq!(wb.sheet(0).unwrap().effective_format("B3"), format);
}

#[test]
fn whole_source_is_written_not_only_preview_and_empty_fields_clear_targets() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    for row in 1..=400 {
        wb.set_cell(0, &format!("A{row}"), Value::Text(format!("r{row},tail")));
    }
    wb.set_cell(0, "A399", Value::Text("short".into()));
    wb.set_cell(0, "D399", Value::Number(77.0));
    wb.set_cell(0, "D400", Value::Text("old".into()));
    wb.add_sheet("Other");
    wb.set_formula(1, "A1", "=Sheet1!D400");
    assert_eq!(wb.get_cell("Other", "A1"), Value::Text("old".into()));
    history
        .split_text_columns(&mut wb, &request("A1", "A400", "C1"), true)
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C400"), Value::Text("r400".into()));
    assert_eq!(wb.get_cell("Sheet1", "D399"), Value::Null);
    assert_eq!(wb.get_cell("Other", "A1"), Value::Text("tail".into()));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D399"), Value::Number(77.0));
    assert_eq!(wb.get_cell("Sheet1", "C400"), Value::Null);
}

#[test]
fn no_op_and_preview_preserve_redo_and_do_not_add_history() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("unchanged".into()));
    let req = request("A1", "A1", "B1");
    history.split_text_columns(&mut wb, &req, false).unwrap();
    history.undo(&mut wb).unwrap();
    wb.preview_text_columns(&req).unwrap();
    let report = history
        .split_text_columns(&mut wb, &request("A1", "A1", "A1"), false)
        .unwrap();
    assert_eq!(report.changed_cells, 0);
    assert_eq!((history.undo_count(), history.redo_count()), (0, 1));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("unchanged".into()));
}

#[test]
fn malformed_late_source_does_not_write_earlier_rows() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("a,b".into()));
    wb.set_cell(0, "A50", Value::Text("\"bad".into()));
    assert!(history
        .split_text_columns(&mut wb, &request("A1", "A50", "A1"), true)
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("a,b".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(!history.is_pending());
}

#[test]
fn merged_source_or_destination_are_rejected_even_after_overwrite_confirmation() {
    for merged in [("A1", "A2"), ("C1", "D1")] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text("a,b".into()));
        let range = request(merged.0, merged.1, "A1").source;
        history
            .merge_cells(&mut wb, 0, range, MergeAction::Merge, true)
            .unwrap();
        history.clear("");
        let req = request("A1", "A2", "C1");
        assert!(wb.preview_text_columns(&req).is_err());
        assert!(history.split_text_columns(&mut wb, &req, true).is_err());
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("a,b".into()));
        assert_eq!(wb.sheet(0).unwrap().merged_ranges(), &[range]);
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn spill_source_or_destination_cannot_be_overwritten() {
    for anchor in ["A1", "C1"] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text("a,b".into()));
        wb.set_formula(0, anchor, "=SEQUENCE(2,1)");
        let req = request("A1", "A2", "C1");
        assert!(wb.preview_text_columns(&req).is_err());
        assert!(history.split_text_columns(&mut wb, &req, true).is_err());
        assert_eq!(
            wb.sheet(0).unwrap().get_formula(anchor).as_deref(),
            Some("=SEQUENCE(2,1)")
        );
        assert_eq!(history.undo_count(), 0);
    }
}

#[test]
fn fixed_width_application_preserves_quotes_and_leading_zeros() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("'x001".into()));
    let mut req = request("A1", "A1", "A1");
    req.mode = TextColumnsMode::FixedWidth {
        breakpoints: vec![2],
    };
    history.split_text_columns(&mut wb, &req, false).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("'x".into()));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("001".into()));
}

#[test]
fn pending_history_is_not_replaced_by_a_split() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    let req = request("A1", "A1", "B1");
    history.begin(&wb, 0, req.source, "existing", true).unwrap();
    assert!(history.split_text_columns(&mut wb, &req, true).is_err());
    assert!(history.is_pending());
    history.finish(&mut wb, false).unwrap();
}

#[test]
fn undo_budget_rejects_before_mutation_and_keeps_existing_history() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("new".into()));
    history
        .split_text_columns(&mut wb, &request("A1", "A1", "C1"), false)
        .unwrap();
    wb.set_cell(0, "B1", Value::Text("x".repeat(16 * 1024 * 1024)));
    assert!(history
        .split_text_columns(&mut wb, &request("A1", "A1", "B1"), true)
        .is_err());
    assert_eq!(
        wb.get_cell("Sheet1", "B1").as_text().unwrap().len(),
        16 * 1024 * 1024
    );
    assert_eq!(history.undo_count(), 1);
    assert!(!history.is_pending());
}

#[test]
fn hidden_rows_remain_in_place_and_inplace_formula_is_restored_by_undo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_formula(0, "A1", "=\"first,001\"");
    wb.set_cell(0, "A2", Value::Text("hidden,002".into()));
    wb.set_eval_hidden_rows(0, &[1]);
    let report = history
        .split_text_columns(&mut wb, &request("A1", "A2", "A1"), false)
        .unwrap();
    assert_eq!(report.changed_cells, 4);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Text("002".into()));
    assert_eq!(wb.list_hidden_rows(0), vec![1]);
    assert_eq!(wb.sheet(0).unwrap().get_formula("A1"), None);
    history.undo(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("A1").as_deref(),
        Some("=\"first,001\"")
    );
    assert_eq!(
        wb.get_cell("Sheet1", "A2"),
        Value::Text("hidden,002".into())
    );
    assert_eq!(wb.list_hidden_rows(0), vec![1]);
}
