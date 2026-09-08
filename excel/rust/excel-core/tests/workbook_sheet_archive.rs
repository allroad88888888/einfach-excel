use einfach_core::{Value, ValueError};
use einfach_excel_core::workbook::{ConditionalFormatRuleEntry, PrintOrientation};
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

fn a1() -> CellRange {
    CellRange::single(CellAddress::new(0, 0))
}

#[test]
fn identity_survives_rename_move_archive_restore_but_is_not_reused_by_a_new_sheet() {
    let mut wb = Workbook::new();
    let original = wb.sheet_key(0).unwrap();
    wb.add_sheet("Other");
    wb.edit_sheet(Some(0), "Orders").unwrap();
    assert_eq!(wb.sheet_key(0), Some(original));
    wb.move_sheet(0, 1);
    assert_eq!(wb.sheet_key(1), Some(original));
    let archive = wb.archive_sheet(1).unwrap();
    assert_eq!(archive.key(), original);
    assert_ne!(wb.sheet_key(0), Some(original));
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.sheet_key(1), Some(original));
    wb.remove_sheet(1);
    let new = wb.add_sheet("Orders");
    assert_ne!(wb.sheet_key(new), Some(original));
    assert_eq!(wb.sheet_key(99), None);
}

#[test]
fn restore_preserves_raw_values_styles_sizes_and_lazy_formula_source() {
    let mut wb = Workbook::new();
    wb.add_sheet("Keep");
    wb.set_cell_input(0, "A1", "'00123").unwrap();
    wb.set_formula(0, "B1", "=1+2");
    wb.sheet_mut(0).unwrap().patch_format_range(
        a1(),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            italic: Some(true),
            ..Default::default()
        },
    );
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(a1(), "row", 40)
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .resize_range(a1(), "column", 200)
        .unwrap();
    let before_evaluations = wb.debug_formula_eval_count(0);
    let archive = wb.archive_sheet(0).unwrap();
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.debug_formula_eval_count(0), before_evaluations);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("00123".into()));
    assert_eq!(
        wb.sheet(0).unwrap().get_formula("B1").as_deref(),
        Some("=1+2")
    );
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(3.0));
    assert!(wb.sheet(0).unwrap().effective_format("A1").bold);
    assert!(wb.sheet(0).unwrap().effective_format("A1").italic);
    assert_eq!(wb.sheet(0).unwrap().row_height(0), Some(40));
    assert_eq!(wb.sheet(0).unwrap().col_width(0), Some(200));
}

#[test]
fn restores_exact_cross_sheet_formula_and_reconnects_future_source_changes() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    let summary = wb.add_sheet("Summary");
    let untouched = wb.add_sheet("Other");
    wb.set_formula(summary, "A1", "=Sheet1!A1*2");
    wb.set_formula(untouched, "A1", "=3+4");
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(14.0));
    let archive = wb.archive_sheet(0).unwrap();
    assert_eq!(
        wb.get_cell("Summary", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    archive.restore(&mut wb).unwrap();
    assert_eq!(
        wb.sheet(summary).unwrap().get_formula("A1").as_deref(),
        Some("=Sheet1!A1*2")
    );
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(14.0));
    wb.set_cell(0, "A1", Value::Number(9.0));
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(18.0));
    assert_eq!(
        wb.sheet(untouched).unwrap().get_formula("A1").as_deref(),
        Some("=3+4")
    );
}

#[test]
fn hidden_rows_print_config_and_conditional_rules_ride_the_archived_sheet() {
    let mut wb = Workbook::new();
    wb.add_sheet("Keep");
    wb.hide_rows(0, &[1, 3]);
    let mut print = wb.print_config(0).unwrap().config;
    print.orientation = PrintOrientation::Landscape;
    let print = wb.set_print_config(0, print).unwrap();
    let rules = wb
        .set_conditional_format_rule(
            0,
            0,
            ConditionalFormatRuleEntry {
                id: "rule".into(),
                row_start: 0,
                row_end: 9,
                col_start: 0,
                col_end: 1,
                priority: 0,
                rule_json: "{}".into(),
            },
        )
        .unwrap();
    let archive = wb.archive_sheet(0).unwrap();
    assert!(wb.list_hidden_rows(0).is_empty());
    assert!(wb.conditional_format_config(0).unwrap().rules.is_empty());
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.list_hidden_rows(0), vec![1, 3]);
    assert_eq!(wb.print_config(0).unwrap(), print);
    assert_eq!(wb.conditional_format_config(0).unwrap(), rules);
    assert!(wb.list_hidden_rows(1).is_empty());
}

#[test]
fn failed_restore_keeps_the_archive_available_and_never_overwrites_another_workbook() {
    let mut wb = Workbook::new();
    wb.add_sheet("Keep");
    wb.set_cell(0, "A1", Value::Number(7.0));
    let archive = wb.archive_sheet(0).unwrap();
    let mut other = Workbook::new();
    other.rename_sheet(0, "Keep");
    let archive = archive.restore(&mut other).unwrap_err();
    assert_eq!(other.sheet_count(), 1);
    assert_eq!(other.get_cell("Keep", "A1"), Value::Null);
    let recreated = wb.add_sheet("Sheet1");
    let archive = archive.restore(&mut wb).unwrap_err();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Null);
    wb.remove_sheet(recreated);
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
}

#[test]
fn archive_rejects_the_last_or_missing_sheet_without_changing_identity() {
    let mut wb = Workbook::new();
    let key = wb.sheet_key(0);
    assert!(wb.archive_sheet(0).is_none());
    assert!(wb.archive_sheet(9).is_none());
    assert_eq!(wb.sheet_key(0), key);
    assert_eq!(wb.sheet_count(), 1);
}

#[test]
fn matching_names_cannot_disguise_replaced_surviving_sheet_identities() {
    let mut wb = Workbook::new();
    wb.add_sheet("Keep");
    let archive = wb.archive_sheet(0).unwrap();
    wb.add_sheet("Temporary");
    wb.remove_sheet(0);
    wb.add_sheet("Keep");
    wb.remove_sheet(0);
    assert_eq!(wb.name(0), Some("Keep"));
    assert!(archive.restore(&mut wb).is_err());
    assert_eq!(wb.sheet_count(), 1);
}

#[test]
fn restores_case_insensitive_table_registry_and_structured_reference_calculation() {
    let mut wb = Workbook::new();
    let summary = wb.add_sheet("Summary");
    wb.set_cell_input(0, "A1", "Units").unwrap();
    wb.set_cell_input(0, "A2", "7").unwrap();
    let table_range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0));
    wb.define_table(Some("OrdersTable"), 0, table_range, true)
        .unwrap();
    wb.set_formula(summary, "A1", "=SUM(OrdersTable[Units])");
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
    let archive = wb.archive_sheet(0).unwrap();
    assert_eq!(wb.table_count(), 0);
    archive.restore(&mut wb).unwrap();
    assert_eq!(wb.table_count(), 1);
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(7.0));
    wb.set_cell_input(0, "A2", "9").unwrap();
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(9.0));
    let archive = wb.archive_sheet(0).unwrap();
    wb.define_table(Some("orderstable"), 0, table_range, true)
        .unwrap();
    assert!(archive.restore(&mut wb).is_err());
    assert_eq!(wb.sheet_count(), 1);
    assert_eq!(wb.table_count(), 1);
}
