use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellFormat, CellRange, CellStyle, FontBaseline as Baseline,
    StyleScope, Workbook, workbook_history::WorkbookHistory};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn range(value: &str) -> CellRange { CellRange::single(addr(value)) }
fn patch(value: Baseline) -> CellStyle {
    CellStyle { font_baseline: Some(value), ..Default::default() }
}

#[test]
fn explicit_normal_overrides_row_column_layers_without_creating_plain_cell_styles() {
    let mut book = Workbook::new();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.patch_format_range(range("A1"), StyleScope::Column, patch(Baseline::Superscript));
    sheet.patch_format_range(range("A2"), StyleScope::Row, patch(Baseline::Subscript));
    sheet.patch_format_range(range("A2"), StyleScope::Cell, patch(Baseline::Normal));
    assert_eq!(sheet.get_format("A1").font_baseline, Baseline::Superscript);
    assert_eq!(sheet.get_format("B2").font_baseline, Baseline::Subscript);
    assert_eq!(sheet.get_format("A2").font_baseline, Baseline::Normal);
    assert_eq!(sheet.get_format("D4").font_baseline, Baseline::Normal);
    let snapshot = sheet.snapshot_format_range(CellRange::new(addr("A1"), addr("D4")));
    assert!(snapshot.cell_styles.iter().any(|(a, style)| *a == addr("A2") && style.font_baseline == Some(Baseline::Normal)));
    assert!(!snapshot.cell_styles.iter().any(|(a, _)| *a == addr("D4")));
    assert!(CellStyle::from_format(CellFormat::default()).font_baseline == Some(Baseline::Normal));
    assert!(!CellStyle::default().overlaps(&patch(Baseline::Normal)));
    assert!(patch(Baseline::Normal).overlaps(&patch(Baseline::Superscript)));
}

#[test]
fn whole_cell_baseline_clears_only_run_baseline_and_undo_restores_every_override() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    book.set_cell_input(0, "A1", "H2O").unwrap();
    book.set_cell_input(0, "B1", "12.5").unwrap();
    book.set_formula(0, "C1", "=B1*2");
    let runs = vec![
        RichTextRun { text: "H".into(), format: RichTextFormat::default() },
        RichTextRun { text: "2O".into(), format: RichTextFormat {
            font_baseline: Some(Baseline::Normal), bold: Some(true), color: Some("#FF0000".into()),
            font_size: Some(18.0), ..Default::default()
        } },
    ];
    book.sheet_mut(0).unwrap().set_rich_text(addr("A1"), runs.clone()).unwrap();
    book.sheet_mut(0).unwrap().patch_format_range(range("A1"), StyleScope::Cell,
        CellStyle { font_size: Some(Some(24)), ..Default::default() });
    let row_height = book.sheet(0).unwrap().row_height(0);
    let targets = [(range("A1"), StyleScope::Cell), (range("C1"), StyleScope::Cell)];
    history.patch_format_selection(&mut book, 0, &targets, patch(Baseline::Superscript)).unwrap();
    let mut expected = runs.clone(); expected[1].format.font_baseline = None;
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A1")), Some(expected.as_slice()));
    assert_eq!(book.sheet(0).unwrap().get_format("A1").font_size, Some(24));
    assert_eq!(book.sheet(0).unwrap().row_height(0), row_height);
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(25.0));
    assert_eq!(book.sheet(0).unwrap().get_formula("C1").as_deref(), Some("=B1*2"));
    assert_eq!(book.sheet(0).unwrap().get_format("B1").font_baseline, Baseline::Normal);
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A1")), Some(runs.as_slice()));
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A1")), Some(expected.as_slice()));
}

#[test]
fn auto_fit_receives_effective_baseline_and_the_original_runs_in_one_measurement() {
    let mut book = Workbook::new();
    book.set_cell_input(0, "A1", "AB").unwrap();
    let runs = vec![RichTextRun { text: "AB".into(), format: RichTextFormat {
        font_baseline: Some(Baseline::Normal), font_size: Some(18.0), ..Default::default()
    } }];
    let sheet = book.sheet_mut(0).unwrap();
    sheet.patch_format_range(range("A1"), StyleScope::Cell, patch(Baseline::Subscript));
    sheet.set_rich_text(addr("A1"), runs.clone()).unwrap();
    let mut count = 0;
    book.auto_fit_dimensions(0, range("A1"), "column", 28, 120, |value, format, width, rich| {
        count += 1;
        assert_eq!(value, &Value::Text("AB".into()));
        assert_eq!(format.font_baseline, Baseline::Subscript);
        assert_eq!(width, 120.0);
        assert_eq!(rich, Some(runs.as_slice()));
        Ok(80.0)
    }).unwrap();
    assert_eq!(count, 1);
    assert_eq!(book.sheet(0).unwrap().col_width(0), Some(80));
}
