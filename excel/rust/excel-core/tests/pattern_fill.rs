#[path = "support/conditional_format_rule.rs"]
mod support;
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellFill, CellFormat, CellRange, CellStyle, FillPattern,
    StyleScope, Workbook, workbook_history::WorkbookHistory};
use serde_json::json;

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn at(value: &str) -> CellRange { CellRange::single(addr(value)) }
fn pattern() -> CellFill {
    CellFill::Pattern { pattern: FillPattern::DarkDown, foreground: "#112233".into() }
}
fn style() -> CellStyle {
    CellStyle { fill: Some(Some(pattern())), background: Some(Some("#eeeeff".into())),
        ..Default::default() }
}

#[test]
fn all_seventeen_patterns_have_strict_color_and_kind_boundaries() {
    for name in ["mediumGray", "darkGray", "lightGray", "darkHorizontal", "darkVertical",
        "darkDown", "darkUp", "darkGrid", "darkTrellis", "lightHorizontal", "lightVertical",
        "lightDown", "lightUp", "lightGrid", "lightTrellis", "gray125", "gray0625"] {
        let wire = json!({"kind":"pattern","pattern":name,"foreground":"#12aBcD"});
        let fill: CellFill = serde_json::from_value(wire.clone()).unwrap();
        assert_eq!(serde_json::to_value(fill).unwrap(), wire);
    }
    for wire in [
        json!({"kind":"unknown","pattern":"darkDown","foreground":"#112233"}),
        json!({"kind":"pattern","pattern":"solid","foreground":"#112233"}),
        json!({"kind":"pattern","pattern":"darkDown","foreground":"red"}),
        json!({"kind":"pattern","pattern":"darkDown","foreground":"#123"}),
        json!({"kind":"pattern","pattern":"darkDown","foreground":"url(x)"}),
        json!({"kind":"pattern","pattern":"darkDown","foreground":"#112233","background":"#ffffff"}),
    ] { assert!(serde_json::from_value::<CellFill>(wire).is_err()); }
}

#[test]
fn cell_clear_overrides_sparse_axes_and_undo_restores_inheritance_without_expanding_cells() {
    let mut book = Workbook::new();
    let mut history = WorkbookHistory::default();
    let sheet = book.sheet_mut(0).unwrap();
    sheet.patch_format_range(at("A1"), StyleScope::Column, style());
    sheet.patch_format_range(at("B2"), StyleScope::Row, style());
    assert_eq!(sheet.get_format("A5").fill, Some(pattern()));
    assert_eq!(sheet.get_format("C2").fill, Some(pattern()));
    let before = sheet.snapshot_format_range(support::range("A1", "D5"));
    let clear = CellStyle { fill: Some(None), ..Default::default() };
    assert!(style().overlaps(&clear));
    assert_eq!(CellStyle::from_format(CellFormat::default()).fill, Some(None));
    history.patch_format_selection(&mut book, 0, &[(at("A2"), StyleScope::Cell)], clear).unwrap();
    let sheet = book.sheet(0).unwrap();
    assert_eq!(sheet.get_format("A2").fill, None);
    assert_eq!(sheet.get_format("A2").background.as_deref(), Some("#eeeeff"));
    assert_eq!(sheet.get_format("B2").fill, Some(pattern()));
    let after = sheet.snapshot_format_range(support::range("A1", "D5"));
    assert_eq!(after.cell_styles.len(), 1);
    assert_eq!(after.cell_styles[0].1.fill, Some(None));
    assert_eq!(history.undo_count(), 1);
    history.undo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(support::range("A1", "D5")), before);
    history.redo(&mut book).unwrap();
    assert_eq!(book.sheet(0).unwrap().snapshot_format_range(support::range("A1", "D5")), after);
}

#[test]
fn conditional_background_hides_pattern_temporarily_but_text_highlight_keeps_it() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(10.));
    book.sheet_mut(0).unwrap().patch_format_range(at("A1"), StyleScope::Cell, style());
    let base = book.sheet(0).unwrap().snapshot_format_range(at("A1"));
    let mut entry = support::rule("pattern-overlay", at("A1"), "gt", "5");
    for (color_key, expected) in [("fgColor", Some(pattern())), ("bgColor", None)] {
        entry.rule_json = json!({"kind":"cell-value","operator":"gt","value":"5",
            "format":{color_key:"#00ff00"}}).to_string();
        let revision = book.conditional_format_config(0).unwrap().revision;
        book.set_conditional_format_rule(0, revision, entry.clone()).unwrap();
        let projected = book.snapshot_display_format_range(0, at("A1")).unwrap();
        let mut effective = CellFormat::default();
        projected.formats.cell_styles[0].1.apply_to(&mut effective);
        assert_eq!(effective.fill, expected);
        assert_eq!(book.sheet(0).unwrap().snapshot_format_range(at("A1")), base);
    }
    book.set_cell(0, "A1", Value::Number(1.));
    let restored = book.snapshot_display_format_range(0, at("A1")).unwrap();
    assert_eq!(restored.formats.cell_styles[0].1.fill, Some(Some(pattern())));
}
