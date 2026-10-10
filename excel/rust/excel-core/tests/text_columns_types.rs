//! 每列类型的值／数字格式、跳过后的真实目标、一次撤销与跨表重算。
use einfach_core::Value;
use einfach_excel_core::text_columns::TextColumnsMode;
use einfach_excel_core::text_columns_value::{TextColumnDateOrder as Order, TextColumnRule, TextColumnType as Kind};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, NumberFormat, Workbook};

fn request(kinds: &[(usize, Kind)]) -> TextColumnsRequest {
    TextColumnsRequest {
        number_options: None,
        sheet: 0, source: CellRange::single(CellAddress::new(0, 0)),
        destination: CellAddress::new(0, 2), row_count: 1000, col_count: 30,
        mode: TextColumnsMode::Delimited { delimiters: vec![','], merge_consecutive: false, qualifier: Some('"') },
        column_types: kinds.iter().map(|&(column, kind)| TextColumnRule { column, kind }).collect(),
    }
}

#[test]
fn explicit_general_text_and_default_text_have_distinct_native_types() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("001,001,001,12.5%,TRUE,1e2,=1+2,'001".into()));
    let req = request(&[(0, Kind::General), (1, Kind::Text), (3, Kind::General),
        (4, Kind::General), (5, Kind::General), (6, Kind::General), (7, Kind::General)]);
    let preview = wb.preview_text_columns(&req).unwrap();
    assert_eq!(preview.source_column_count, 8);
    assert_eq!(preview.sample[0], ["1", "001", "001", "12.5%", "TRUE", "100", "=1+2", "'001"]);
    history.split_text_columns(&mut wb, &req, false).unwrap();
    for (address, value) in [("C1", Value::Number(1.0)), ("D1", Value::Text("001".into())),
        ("E1", Value::Text("001".into())), ("F1", Value::Number(0.125)),
        ("G1", Value::Boolean(true)), ("H1", Value::Number(100.0)),
        ("I1", Value::Text("=1+2".into())), ("J1", Value::Text("'001".into()))] {
        assert_eq!(wb.get_cell("Sheet1", address), value, "{address}");
    }
    assert_eq!(wb.sheet(0).unwrap().get_formula("I1"), None);
    assert_eq!(wb.sheet(0).unwrap().get_format("D1").number_format, NumberFormat::Text);
}

#[test]
fn six_date_orders_share_the_same_serial_and_display() {
    for (order, source) in [(Order::Mdy, "02/29/2024"), (Order::Dmy, "29/02/2024"),
        (Order::Ymd, "2024/02/29"), (Order::Myd, "02/2024/29"),
        (Order::Dym, "29/2024/02"), (Order::Ydm, "2024/29/02")] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text(source.into()));
        let req = request(&[(0, Kind::Date(order))]);
        assert_eq!(wb.preview_text_columns(&req).unwrap().sample[0][0], "2024-02-29");
        history.split_text_columns(&mut wb, &req, false).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(45351.0));
        assert_eq!(wb.sheet(0).unwrap().formatted_display("C1"), "2024-02-29");
    }
}

#[test]
fn explicit_date_order_resolves_ambiguity_without_guessing() {
    for (order, expected) in [(Order::Mdy, "2024-02-03"), (Order::Dmy, "2024-03-02")] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Text("02/03/2024".into()));
        assert_eq!(wb.preview_text_columns(&request(&[(0, Kind::Date(order))])).unwrap().sample[0][0], expected);
    }
}

#[test]
fn date_separators_compact_and_two_digit_years_use_deterministic_rules() {
    for (source, expected) in [("29-02-2024", "2024-02-29"), ("29.02.2024", "2024-02-29"),
        ("29022024", "2024-02-29"), ("1/1/29", "2029-01-01"), ("1/1/30", "1930-01-01"),
        ("29/2/1900", "1900-02-29"), (" 29 / 2 / 2024 ", "2024-02-29")] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "A1", Value::Text(source.into()));
        assert_eq!(wb.preview_text_columns(&request(&[(0, Kind::Date(Order::Dmy))])).unwrap().sample[0][0], expected);
    }
}

#[test]
fn invalid_dates_and_non_finite_numbers_remain_original_text() {
    for source in ["31/02/2024", "29/02/2023", "00/01/2024", "01/01/1899", "1/1/10000",
        "02/29/2024", "1-2/2024", "1/1/2", "2024-02-29", "=NOW()", "NaN", "Infinity"] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text(source.into()));
        history.split_text_columns(&mut wb, &request(&[(0, Kind::Date(Order::Dmy))]), false).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text(source.into()));
    }
    for source in ["NaN", "Infinity", "1e999", "02/03/2024"] {
        let mut wb = Workbook::new();
        let mut history = WorkbookHistory::default();
        wb.set_cell(0, "A1", Value::Text(source.into()));
        history.split_text_columns(&mut wb, &request(&[(0, Kind::General)]), false).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text(source.into()));
    }
}

#[test]
fn date_and_text_formats_undo_with_values_and_preserve_other_styles() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("29/02/2024,0007".into()));
    wb.set_formula(0, "C1", "=42");
    let old = CellFormat { italic: true, number_format: NumberFormat::Percent { digits: 2 }, ..Default::default() };
    wb.sheet_mut(0).unwrap().set_format("C1", old.clone());
    wb.add_sheet("Other");
    wb.set_formula(1, "A1", "=Sheet1!C1+1");
    let req = request(&[(0, Kind::Date(Order::Dmy)), (1, Kind::Text)]);
    history.split_text_columns(&mut wb, &req, true).unwrap();
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(45352.0));
    assert!(wb.sheet(0).unwrap().get_format("C1").italic);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_formula("C1").as_deref(), Some("=42"));
    assert_eq!(wb.sheet(0).unwrap().get_format("C1"), old);
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(43.0));
    history.redo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(45352.0));
    assert_eq!(wb.sheet(0).unwrap().get_format("D1").number_format, NumberFormat::Text);
}

#[test]
fn skipped_fields_pack_left_and_do_not_clear_or_confirm_unused_destinations() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("ignore,001,ignore,29/02/2024".into()));
    wb.set_cell(0, "E1", Value::Text("keep".into()));
    let req = request(&[(0, Kind::Skip), (1, Kind::General), (2, Kind::Skip), (3, Kind::Date(Order::Dmy))]);
    let preview = wb.preview_text_columns(&req).unwrap();
    assert_eq!(preview.target.end, CellAddress::new(0, 3));
    assert_eq!(preview.overwritten_cells, 0);
    assert_eq!(preview.source_column_count, 4);
    assert_eq!(preview.sample[0], ["1", "2024-02-29"]);
    assert_eq!(history.split_text_columns(&mut wb, &req, false).unwrap().changed_cells, 2);
    assert_eq!(wb.get_cell("Sheet1", "E1"), Value::Text("keep".into()));
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
}

#[test]
fn skipping_all_duplicate_or_nonexistent_fields_rejects_without_history() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("a,b".into()));
    for rules in [vec![(0, Kind::Skip), (1, Kind::Skip)], vec![(2, Kind::Text)],
        vec![(0, Kind::Text), (0, Kind::General)], vec![(16384, Kind::Skip)]] {
        let req = request(&rules);
        assert!(wb.preview_text_columns(&req).is_err());
        assert!(history.split_text_columns(&mut wb, &req, true).is_err());
        assert_eq!(history.undo_count(), 0);
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Null);
    }
}

#[test]
fn skip_can_make_output_fit_the_final_canvas_column() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("a,b,001".into()));
    let mut req = request(&[(0, Kind::Skip), (1, Kind::Skip), (2, Kind::General)]);
    req.destination = CellAddress::new(0, 29);
    history.split_text_columns(&mut wb, &req, false).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "AD1"), Value::Number(1.0));
}

#[test]
fn types_apply_after_sampling_limit_and_missing_fields_clear_in_compacted_output() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    for row in 1..=400 { wb.set_cell(0, &format!("A{row}"), Value::Text("skip,0001,29/02/2024".into())); }
    wb.set_cell(0, "A399", Value::Text("skip".into()));
    wb.set_cell(0, "D399", Value::Number(123.0));
    let mut req = request(&[(0, Kind::Skip), (1, Kind::General), (2, Kind::Date(Order::Dmy))]);
    req.source.end.row = 399;
    wb.set_eval_hidden_rows(0, &[399]);
    let preview = wb.preview_text_columns(&req).unwrap();
    assert_eq!(preview.sample.len(), 20);
    history.split_text_columns(&mut wb, &req, true).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C400"), Value::Number(1.0));
    assert_eq!(wb.get_cell("Sheet1", "D400"), Value::Number(45351.0));
    assert_eq!(wb.get_cell("Sheet1", "D399"), Value::Null);
    assert_eq!(wb.list_hidden_rows(0), vec![399]);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "D399"), Value::Number(123.0));
}

#[test]
fn format_only_change_is_undoable_but_reapplying_is_a_noop() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("001".into()));
    wb.set_cell(0, "C1", Value::Text("001".into()));
    let req = request(&[(0, Kind::Text)]);
    assert_eq!(history.split_text_columns(&mut wb, &req, true).unwrap().changed_cells, 1);
    assert_eq!(history.split_text_columns(&mut wb, &req, true).unwrap().changed_cells, 0);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().get_format("C1").number_format, NumberFormat::General);
}
