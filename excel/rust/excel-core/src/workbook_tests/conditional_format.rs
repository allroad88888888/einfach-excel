use super::*;

fn rule(id: &str) -> ConditionalFormatRuleEntry {
    ConditionalFormatRuleEntry {
        id: id.to_string(),
        row_start: 0,
        row_end: 1,
        col_start: 0,
        col_end: 1,
        priority: 0,
        rule_json: r#"{\"kind\":\"cell-value\",\"operator\":\"greater-than\",\"value\":1}"#
            .to_string(),
    }
}

#[test]
fn conditional_formats_are_sheet_scoped_and_reject_stale_mutations() {
    let mut workbook = Workbook::new();
    let second = workbook.add_sheet("Second");
    let first = workbook
        .set_conditional_format_rule(0, 0, rule("first"))
        .unwrap();
    assert_eq!(first.revision, 1);
    assert_eq!(
        workbook.conditional_format_config(second).unwrap().revision,
        0
    );
    assert_eq!(
        workbook.set_conditional_format_rule(0, 0, rule("stale")),
        Err(ConditionalFormatError::StaleRevision {
            expected: 0,
            actual: 1,
        })
    );
    let removed = workbook
        .remove_conditional_format_rule(0, 1, "first")
        .unwrap();
    assert_eq!(removed.revision, 2);
    assert!(removed.rules.is_empty());
}

#[test]
fn conditional_formats_ride_sheet_moves_and_persistence_snapshots() {
    let mut workbook = Workbook::new();
    workbook.add_sheet("Second");
    workbook
        .set_conditional_format_rule(1, 0, rule("second"))
        .unwrap();
    assert!(workbook.move_sheet(1, 0));
    assert_eq!(
        workbook.conditional_format_config(0).unwrap().rules[0].id,
        "second"
    );
    let snapshots = workbook.snapshot_conditional_formats();
    let mut restored = Workbook::new();
    restored.add_sheet("Second");
    assert_eq!(restored.restore_conditional_formats(snapshots).unwrap(), 1);
    assert_eq!(restored.conditional_format_config(0).unwrap().revision, 1);
}
