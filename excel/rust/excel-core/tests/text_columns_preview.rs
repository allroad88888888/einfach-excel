//! 分列预览来自完整原生数据；采样限制只限制回传，不限制校验范围。
use einfach_core::Value;
use einfach_excel_core::text_columns::TextColumnsMode;
use einfach_excel_core::workbook_text_columns::TextColumnsRequest;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, Workbook};

fn request(start: &str, end: &str, destination: &str) -> TextColumnsRequest {
    TextColumnsRequest {
        sheet: 0,
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
fn preview_is_read_only_and_reports_full_rectangular_output() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("001,\"北京,上海\",=1+2".into()));
    wb.set_cell(0, "A2", Value::Text("short".into()));
    wb.set_cell(0, "D2", Value::Number(99.0));
    wb.set_formula(0, "C1", "=\"\"");
    let preview = wb.preview_text_columns(&request("A1", "A2", "C1")).unwrap();
    assert_eq!(preview.target, request("C1", "E2", "C1").source);
    assert_eq!(
        preview.sample,
        vec![vec!["001", "北京,上海", "=1+2"], vec!["short", "", ""]]
    );
    assert_eq!(preview.overwritten_cells, 2);
    assert!(!preview.sample_truncated);
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(99.0));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("C1").as_deref(),
        Some("=\"\"")
    );
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Text("001,\"北京,上海\",=1+2".into())
    );
}

#[test]
fn preview_samples_twenty_rows_but_counts_late_overwrites_and_late_width() {
    let mut wb = Workbook::new();
    for row in 1..=400 {
        wb.set_cell(0, &format!("A{row}"), Value::Text("one,two".into()));
    }
    wb.set_cell(0, "A400", Value::Text("one,two,three".into()));
    wb.set_cell(0, "E400", Value::Boolean(false));
    let preview = wb
        .preview_text_columns(&request("A1", "A400", "C1"))
        .unwrap();
    assert_eq!(preview.sample.len(), 20);
    assert!(preview.sample_truncated);
    assert_eq!(preview.target, request("C1", "E400", "C1").source);
    assert_eq!(preview.overwritten_cells, 1);
    assert_eq!(preview.sample[0], ["one", "two", ""]);
}

#[test]
fn late_invalid_quote_rejects_the_entire_preview() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A401", Value::Text("\"unfinished".into()));
    assert!(wb
        .preview_text_columns(&request("A1", "A401", "C1"))
        .is_err());
}

#[test]
fn previews_bound_columns_and_unicode_text_without_changing_source() {
    let mut wb = Workbook::new();
    let source = format!("{},{}", "😀".repeat(121), "x,".repeat(15));
    wb.set_cell(0, "A1", Value::Text(source.clone()));
    let preview = wb.preview_text_columns(&request("A1", "A1", "B1")).unwrap();
    assert_eq!(preview.target.cols(), 17);
    assert_eq!(preview.sample[0].len(), 12);
    assert_eq!(preview.sample[0][0], "😀".repeat(120));
    assert!(preview.sample_truncated);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text(source));
}

#[test]
fn inplace_source_is_expected_but_other_destination_content_requires_confirmation() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("a,b".into()));
    wb.set_cell(0, "A2", Value::Text("c,d".into()));
    wb.sheet_mut(0).unwrap().set_format(
        "B1",
        CellFormat {
            bold: true,
            ..Default::default()
        },
    );
    assert_eq!(
        wb.preview_text_columns(&request("A1", "A2", "A1"))
            .unwrap()
            .overwritten_cells,
        0
    );
    // 移到下一行不是原地分列；即使目标与源重叠也必须确认。
    assert_eq!(
        wb.preview_text_columns(&request("A1", "A2", "A2"))
            .unwrap()
            .overwritten_cells,
        1
    );
    wb.set_cell(0, "B2", Value::Text(String::new()));
    assert_eq!(
        wb.preview_text_columns(&request("A1", "A2", "A1"))
            .unwrap()
            .overwritten_cells,
        1
    );
}

#[test]
fn fixed_width_uses_unicode_positions_and_formula_result_not_formula_source() {
    let mut wb = Workbook::new();
    wb.set_formula(0, "A1", "=\"北京😀AB007\"");
    let mut req = request("A1", "A1", "C1");
    req.mode = TextColumnsMode::FixedWidth {
        breakpoints: vec![2, 5],
    };
    let preview = wb.preview_text_columns(&req).unwrap();
    assert_eq!(preview.sample[0], ["北京", "😀AB", "007"]);
    assert!(wb.sheet(0).unwrap().get_formula("A1").is_some());
}

#[test]
fn invalid_ranges_sheet_and_grid_overflow_are_rejected() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("a,b".into()));
    for req in [
        request("A1", "B2", "C1"),
        request("A2", "A1", "C1"),
        request("A1", "A1048577", "C1"),
        request("XFE1", "XFE1", "C1"),
        request("A1", "A2", "A1048576"),
        request("A1", "A1", "XFD1"),
        request("A1", "A1", "XFE1"),
        request("A1", "A1", "A1048577"),
        TextColumnsRequest {
            sheet: 9,
            ..request("A1", "A1", "C1")
        },
    ] {
        assert!(wb.preview_text_columns(&req).is_err(), "{req:?}");
    }
}

#[test]
fn maximum_worksheet_cell_is_allowed_when_result_fits() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("single".into()));
    let preview = wb
        .preview_text_columns(&request("A1", "A1", "XFD1048576"))
        .unwrap();
    assert_eq!(preview.target.start, CellAddress::new(1_048_575, 16_383));
    assert_eq!(preview.target.start, preview.target.end);
}

#[test]
fn rectangular_expansion_and_source_count_are_bounded_without_truncation() {
    let mut wb = Workbook::new();
    assert!(wb
        .preview_text_columns(&request("A1", "A100001", "B1"))
        .is_err());
    wb.set_cell(0, "A1", Value::Text("a,b,c".into()));
    assert!(wb
        .preview_text_columns(&request("A1", "A40000", "B1"))
        .is_err());
}

#[test]
fn host_canvas_limits_are_enforced_before_preview_or_write() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("a,b".into()));
    let req = TextColumnsRequest {
        row_count: 100,
        col_count: 8,
        ..request("A1", "A1", "H1")
    };
    assert!(wb.preview_text_columns(&req).is_err());
    let req = TextColumnsRequest {
        row_count: 100,
        col_count: 8,
        ..request("A1", "A2", "G100")
    };
    assert!(wb.preview_text_columns(&req).is_err());
    for (row_count, col_count) in [(0, 8), (100, 0), (1_048_577, 8), (100, 16_385)] {
        let req = TextColumnsRequest {
            row_count,
            col_count,
            ..request("A1", "A1", "B1")
        };
        assert!(wb.preview_text_columns(&req).is_err());
    }
}

#[test]
fn cumulative_payload_limit_rejects_instead_of_returning_a_truncated_plan() {
    let mut wb = Workbook::new();
    for row in 1..=3 {
        wb.set_cell(
            0,
            &format!("A{row}"),
            Value::Text("x".repeat(12 * 1024 * 1024)),
        );
    }
    assert!(wb.preview_text_columns(&request("A1", "A3", "B1")).is_err());
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Null);
}
