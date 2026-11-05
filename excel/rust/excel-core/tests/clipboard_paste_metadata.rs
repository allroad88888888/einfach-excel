//! 选择性粘贴「仅备注」「仅数据验证」：只改附属数据、整份平铺、一步撤销。
use einfach_core::Value;
use einfach_excel_core::clipboard::{ClipboardPasteMode, ClipboardPasteOptions};
use einfach_excel_core::data_validation::{DataValidationKind, DataValidationRule};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}
fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}
fn options(start: &str, end: &str, mode: ClipboardPasteMode) -> ClipboardPasteOptions {
    ClipboardPasteOptions { mode, ..ClipboardPasteOptions::new(range(start, end)) }
}
fn custom(formula: &str, anchor: &str) -> DataValidationRule {
    DataValidationRule {
        kind: DataValidationKind::CustomFormula { formula: formula.into(), anchor: addr(anchor) },
        ignore_blank: false,
        operator: Default::default(),
        options: Default::default(),
    }
}
fn whole(min: f64, max: f64) -> DataValidationRule {
    DataValidationRule {
        kind: DataValidationKind::WholeNumber { min, max },
        ignore_blank: true,
        operator: Default::default(),
        options: Default::default(),
    }
}

#[test]
fn notes_paste_tiles_source_notes_and_keeps_values_and_other_notes() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.sheet_mut(0).unwrap().set_note(addr("A1"), Some("check")).unwrap();
    wb.set_cell(0, "D1", Value::Number(9.0));
    wb.sheet_mut(0).unwrap().set_note(addr("D2"), Some("keep")).unwrap();
    let clip = wb.capture_clipboard(0, range("A1", "B1"), false).unwrap();
    wb.paste_clipboard_with_history(&clip, 0, &options("D1", "G2", ClipboardPasteMode::Notes),
        &mut history).unwrap();
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.note(addr("D1")), Some("check"));
    assert_eq!(sheet.note(addr("F1")), Some("check"));
    assert_eq!(sheet.note(addr("D2")), Some("check"));
    assert_eq!(sheet.note(addr("E1")), None, "source cells without notes leave targets alone");
    assert_eq!(sheet.get_cell("D1"), Value::Number(9.0), "values are untouched");
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().note(addr("D1")), None);
    assert_eq!(wb.sheet(0).unwrap().note(addr("D2")), Some("keep"));
}

#[test]
fn validation_paste_replaces_target_rules_and_shifts_custom_formulas() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    {
        let sheet = wb.sheet_mut(0).unwrap();
        sheet.set_data_validation(range("A1", "A2"), Some(custom("=A1>B1", "A1"))).unwrap();
        sheet.set_data_validation(range("D1", "D3"), Some(whole(1.0, 5.0))).unwrap();
    }
    let clip = wb.capture_clipboard(0, range("A1", "B2"), false).unwrap();
    wb.paste_clipboard_with_history(&clip, 0, &options("D3", "E4", ClipboardPasteMode::Validation),
        &mut history).unwrap();
    let sheet = wb.sheet(0).unwrap();
    let pasted = sheet.data_validation_at(addr("D3")).unwrap();
    let DataValidationKind::CustomFormula { formula, anchor } = &pasted.kind else { panic!() };
    assert_eq!(formula.replace(['(', ')'], ""), "=D3>E3", "relative references move like a copy");
    assert_eq!(*anchor, addr("D3"));
    assert!(sheet.data_validation_at(addr("E3")).is_none(), "source cells without rules clear the target");
    assert_eq!(sheet.data_validation_at(addr("D2")), Some(&whole(1.0, 5.0)), "outside the paste stays");
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().data_validation_at(addr("D3")), Some(&whole(1.0, 5.0)));
}

#[test]
fn metadata_modes_reject_text_and_combined_options() {
    let mut wb = Workbook::new();
    let clip = wb.capture_clipboard(0, range("A1", "A1"), false).unwrap();
    let mut transpose = options("C1", "C1", ClipboardPasteMode::Notes);
    transpose.transpose = true;
    assert_eq!(wb.paste_clipboard(&clip, 0, &transpose), Err("CLIPBOARD_METADATA_OPTIONS"));
    assert!(einfach_excel_core::clipboard::ClipboardSnapshot::from_tsv(
        "x", ClipboardPasteMode::Validation).is_err());
}
