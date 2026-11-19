use einfach_core::Value;
use einfach_excel_core::sort::{
    SortColorKey, SortColorPosition, SortColorSource, SortCriterion,
};
use einfach_excel_core::{CellAddress, CellFill, CellFormat, CellRange, FillPattern, NumberFormat, Workbook};

fn range() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(4, 1))
}

fn rows(book: &Workbook) -> Vec<Value> {
    (1..=5).map(|row| book.get_cell("Colors", &format!("B{row}"))).collect()
}

fn expect_rows(book: &Workbook, expected: &[&str]) {
    assert_eq!(rows(book), expected.iter().map(|s| Value::Text((*s).into())).collect::<Vec<_>>());
}

#[test]
fn repeated_color_column_targets_preserve_stable_rows_and_distinguish_pattern_and_no_fill() {
    let mut book = Workbook::new();
    let sheet_idx = book.add_sheet("Colors");
    let sheet = book.sheet_mut(sheet_idx).unwrap();
    for (row, label) in ["none", "red-1", "pattern", "white", "red-2"].iter().enumerate() {
        sheet.set_cell(&format!("B{}", row + 1), Value::Text((*label).into()));
    }
    for (cell, color) in [("A2", "red"), ("A4", "#ffffff"), ("A5", "#f00")] {
        sheet.set_format(cell, CellFormat { background: Some(color.into()), ..CellFormat::default() });
    }
    sheet.set_format("A3", CellFormat {
        background: Some("#ff0000".into()),
        fill: Some(CellFill::Pattern { pattern: FillPattern::DarkGrid, foreground: "#ff0000".into() }),
        ..CellFormat::default()
    });
    let keys = [
        SortCriterion::Color(SortColorKey::new(0, SortColorSource::Fill, Some("#FF0000"),
            SortColorPosition::Top).unwrap()),
        SortCriterion::Color(SortColorKey::new(0, SortColorSource::Fill, None,
            SortColorPosition::Bottom).unwrap()),
    ];
    book.sort_range_by_criteria(sheet_idx, range(), &keys, &[]).unwrap();
    expect_rows(&book, &["red-1", "red-2", "pattern", "white", "none"]);
    assert!(book.sheet(sheet_idx).unwrap().get_format("A3").fill.is_some());
    assert_eq!(book.sort_range_by_criteria(sheet_idx, range(), &keys, &[]).unwrap().moved_rows, 0);
}

#[test]
fn visible_number_section_font_color_has_precedence_over_base_font() {
    let mut book = Workbook::new();
    let sheet_idx = book.add_sheet("Colors");
    let sheet = book.sheet_mut(sheet_idx).unwrap();
    for (row, label) in ["blue", "section-red", "base-red", "automatic", "negative"].iter().enumerate() {
        sheet.set_cell(&format!("B{}", row + 1), Value::Text((*label).into()));
    }
    for (cell, input) in [("A2", 12.0), ("A5", -12.0)] {
        sheet.set_cell(cell, Value::Number(input));
        sheet.set_format(cell, CellFormat { color: Some("#0000ff".into()),
            number_format: NumberFormat::Custom("[Red]0;[Blue]0".into()), ..CellFormat::default() });
    }
    for (cell, color) in [("A1", "#0000ff"), ("A3", "rgb(255, 0, 0)")] {
        sheet.set_format(cell, CellFormat { color: Some(color.into()), ..CellFormat::default() });
    }
    let keys = [SortCriterion::Color(SortColorKey::new(0, SortColorSource::Font, Some("#ff0000"),
        SortColorPosition::Top).unwrap())];
    book.sort_range_by_criteria(sheet_idx, range(), &keys, &[]).unwrap();
    expect_rows(&book, &["section-red", "base-red", "blue", "automatic", "negative"]);
}
