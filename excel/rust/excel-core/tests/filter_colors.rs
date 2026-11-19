use einfach_core::Value;
use einfach_excel_core::advanced_filter::ColumnFilterGroup;
use einfach_excel_core::filter::{FilterColorSource, FilterColorTarget};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};
use einfach_excel_core::workbook::FilterValuesQuery;
use einfach_excel_core::{CellAddress, CellFill, CellFormat, CellRange, ColumnFilterRule,
    FillPattern, NumberFormat, Workbook};

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}

fn color(col_index: u32, source: FilterColorSource, value: Option<&str>) -> ColumnFilterRule {
    ColumnFilterRule::Color { col_index, source, color: FilterColorTarget::new(value).unwrap() }
}

fn fill(book: &mut Workbook, cell: &str, css: &str) {
    book.sheet_mut(0).unwrap().set_format(cell, CellFormat {
        background: Some(css.into()), ..CellFormat::default()
    });
}

fn query(column: u32) -> FilterValuesQuery<'static> {
    FilterValuesQuery { column, table: None, search: "", offset: 0, limit: 20 }
}

#[test]
fn blank_colored_cells_match_and_no_fill_excludes_explicit_white_patterns_and_alpha() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Color".into()));
    for row in 2..=7 { book.set_cell(0, &format!("B{row}"), Value::Number(1.)); }
    fill(&mut book, "A2", "#f00");
    fill(&mut book, "A4", "white");
    fill(&mut book, "A6", "rgba(255, 0, 0, 0.4)");
    fill(&mut book, "A7", "rgba(255, 0, 0, 1)");
    book.sheet_mut(0).unwrap().set_format("A5", CellFormat {
        background: Some("#ff0000".into()),
        fill: Some(CellFill::Pattern { pattern: FillPattern::DarkGrid, foreground: "#f00".into() }),
        ..CellFormat::default()
    });
    let bounds = range("A1", "B7");
    let red = color(0, FilterColorSource::Fill, Some("#ff0000"));
    let applied = book.apply_filter_range(0, bounds, &[red]).unwrap();
    assert_eq!(applied.hidden_rows, [2, 3, 4, 5]);
    let page = book.filter_colors(0, query(0), FilterColorSource::Fill).unwrap();
    assert_eq!(page.values.iter().map(|item| (item.value.as_str(), item.count)).collect::<Vec<_>>(),
        [("automatic", 1), ("#ff0000", 2), ("#ffffff", 1)]);
    let no_fill = color(0, FilterColorSource::Fill, None);
    assert_eq!(book.apply_filter_range(0, bounds, &[no_fill]).unwrap().hidden_rows, [1, 3, 4, 5, 6]);
}

#[test]
fn font_candidates_count_each_row_once_and_use_rich_runs_and_number_sections() {
    let mut book = Workbook::new();
    book.set_cell(0, "A2", Value::Text("red green red".into()));
    book.set_cell(0, "A3", Value::Number(3.));
    book.set_cell(0, "A4", Value::Number(-3.));
    book.set_cell(0, "A5", Value::Text("automatic".into()));
    let sheet = book.sheet_mut(0).unwrap();
    sheet.set_format("A2", CellFormat { color: Some("#008000".into()), ..CellFormat::default() });
    sheet.set_rich_text(CellAddress::new(1, 0), vec![
        RichTextRun { text: "red".into(), format: RichTextFormat { color: Some("#ff0000".into()), ..Default::default() } },
        RichTextRun { text: " green ".into(), format: RichTextFormat::default() },
        RichTextRun { text: "red".into(), format: RichTextFormat { color: Some("#ff0000".into()), ..Default::default() } },
    ]).unwrap();
    for cell in ["A3", "A4"] {
        sheet.set_format(cell, CellFormat { color: Some("#000000".into()),
            number_format: NumberFormat::Custom("[Red]0;[Blue]0".into()), ..CellFormat::default() });
    }
    let bounds = range("A1", "A5");
    let rule = color(0, FilterColorSource::Font, Some("#FF0000"));
    assert_eq!(book.apply_filter_range(0, bounds, &[rule]).unwrap().hidden_rows, [3, 4]);
    let saved = book.snapshot_filters();
    let page = book.filter_colors(0, FilterValuesQuery { limit: 1, offset: 3, ..query(0) },
        FilterColorSource::Font).unwrap();
    assert_eq!(page.total, 4);
    assert_eq!((page.values[0].value.as_str(), page.values[0].count), ("#ff0000", 2));
    assert_eq!(book.snapshot_filters(), saved);
    let automatic = color(0, FilterColorSource::Font, None);
    assert_eq!(book.apply_filter_range(0, bounds, &[automatic]).unwrap().hidden_rows, [1, 2, 3]);
}

#[test]
fn grouped_colors_use_distinct_keys_and_reapply_refreshes_only_their_snapshot() {
    let mut book = Workbook::new();
    for (row, score) in [(2, 1.), (3, 6.), (4, 6.), (5, 3.)] {
        book.set_cell(0, &format!("B{row}"), Value::Number(score));
    }
    for (cell, css) in [("A2", "red"), ("A3", "white"), ("A4", "red"), ("A5", "white")] {
        fill(&mut book, cell, css);
    }
    let score = ColumnFilterRule::Range { col_index: 1, min: Some(5.), max: None };
    let red = color(0, FilterColorSource::Fill, Some("#ff0000"));
    let white = color(0, FilterColorSource::Fill, Some("#ffffff"));
    let groups = [ColumnFilterGroup { rules: vec![red, score] }, ColumnFilterGroup { rules: vec![white] }];
    let result = book.apply_filter_range_groups(0, range("A1", "B5"), &groups).unwrap();
    assert_eq!(result.hidden_rows, [1]);
    let saved = book.snapshot_filters();
    fill(&mut book, "A2", "white");
    assert_eq!(book.filter_hidden_rows(0), [1]);
    assert!(book.reapply_filter(0).unwrap().hidden_rows.is_empty());
    book.restore_filters(saved).unwrap();
    assert_eq!(book.filter_hidden_rows(0), [1]);
}
