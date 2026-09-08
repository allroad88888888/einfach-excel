use einfach_core::Value;
use einfach_excel_core::cell_style::{CellStyle, StyleScope};
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn copy(source: CellRange, target: CellRange, direction: AutoFillDirection) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: source,
        target_range: target,
        direction,
        series: AutoFillSeries::Copy,
        step: None,
        text_pattern: None,
        list: None,
    }
}

#[test]
fn fill_down_shifts_formulas_without_changing_absolute_references() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "A2", Value::Number(3.0));
    wb.set_cell(0, "A3", Value::Number(4.0));
    assert!(wb.set_formula(0, "B1", "=A1+$A$1"));
    let result = wb
        .apply_auto_fill(&copy(
            range("B1", "B1"),
            range("B1", "B3"),
            AutoFillDirection::Down,
        ))
        .unwrap();
    assert_eq!(result.written, 2);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Number(6.0));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(4.0));
}

#[test]
fn plain_source_overrides_target_row_and_column_styles_without_changing_those_styles() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(0.0));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("B1", "B1048576"),
        StyleScope::Column,
        CellStyle {
            bold: Some(true),
            color: Some(Some("red".into())),
            ..Default::default()
        },
    );
    wb.apply_auto_fill(&copy(
        range("A1", "A1"),
        range("A1", "B1"),
        AutoFillDirection::Right,
    ))
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(0.0));
    let sheet = wb.sheet(0).unwrap();
    assert!(!sheet.effective_format("B1").bold);
    assert_eq!(sheet.effective_format("B1").color, None);
    assert!(sheet.effective_format("B2").bold);
    assert_eq!(sheet.effective_format("B2").color.as_deref(), Some("red"));
}

#[test]
fn fill_repeats_effective_format_and_grows_only_destination_rows() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("seed".into()));
    wb.sheet_mut(0).unwrap().patch_format_range(
        range("A1", "XFD1"),
        StyleScope::Row,
        CellStyle {
            italic: Some(true),
            font_size: Some(Some(36)),
            ..Default::default()
        },
    );
    wb.apply_auto_fill(&copy(
        range("A1", "A1"),
        range("A1", "A3"),
        AutoFillDirection::Down,
    ))
    .unwrap();
    assert!(wb.sheet(0).unwrap().effective_format("A3").italic);
    assert_eq!(
        wb.sheet(0).unwrap().effective_format("A3").font_size,
        Some(36)
    );
    assert!(!wb.sheet(0).unwrap().effective_format("B3").italic);
    let sheet = wb.sheet(0).unwrap();
    assert!(sheet.row_height(1).is_some_and(|height| height > 36));
    assert_eq!(sheet.row_height(2), sheet.row_height(1));
    assert_eq!(sheet.row_height(3), None);
}

#[test]
fn merged_target_is_rejected_before_any_value_changes() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(5.0));
    wb.set_cell(0, "A2", Value::Number(7.0));
    wb.sheet_mut(0)
        .unwrap()
        .restore_merged_ranges(vec![range("A3", "B3")])
        .unwrap();
    assert!(wb
        .apply_auto_fill(&copy(
            range("A1", "B1"),
            range("A1", "B3"),
            AutoFillDirection::Down
        ))
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(7.0));
}

#[test]
fn blank_source_clears_destination_formula_but_preserves_neighbors() {
    let mut wb = Workbook::new();
    assert!(wb.set_formula(0, "A2", "=1+2"));
    wb.set_cell(0, "B2", Value::Boolean(true));
    wb.apply_auto_fill(&copy(
        range("A1", "A1"),
        range("A1", "A2"),
        AutoFillDirection::Down,
    ))
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Boolean(true));
}
