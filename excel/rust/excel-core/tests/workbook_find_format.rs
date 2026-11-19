use einfach_core::Value;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellRange, CellStyle, FindFormatFilter, FindLookIn, FindNumberFormatKind,
    FindQuery, NumberFormat, StyleScope, Workbook,
};

fn all() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(99, 25))
}

fn format_query(needle: &str, format: FindFormatFilter) -> FindQuery {
    FindQuery {
        needle: needle.into(),
        case_sensitive: false,
        whole_cell: false,
        wildcards: false,
        look_in: FindLookIn::Formulas,
        format: Some(format),
    }
}

#[test]
fn find_by_format_matches_populated_and_styled_empty_cells() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Total".into()));
    wb.set_cell(0, "A2", Value::Text("Total".into()));
    wb.set_cell(0, "B1", Value::Number(42.0));
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(0, 0)),
        StyleScope::Cell,
        CellStyle {
            bold: Some(true),
            background: Some(Some("#FFF2CC".into())),
            ..Default::default()
        },
    );
    // Styled empty cell at C3 with the same yellow fill
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(2, 2)),
        StyleScope::Cell,
        CellStyle {
            background: Some(Some("#fff2cc".into())),
            ..Default::default()
        },
    );
    // Percent formatted cell at B1
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(0, 1)),
        StyleScope::Cell,
        CellStyle {
            number_format: Some(NumberFormat::Percent { digits: 1 }),
            ..Default::default()
        },
    );

    // Format-only search for #fff2cc finds A1 and empty C3 in row-major order
    let by_fill = wb
        .find_cells(
            &[(0, all())],
            &format_query(
                "",
                FindFormatFilter {
                    bg_color: Some("#fff2cc".into()),
                    ..Default::default()
                },
            ),
            0,
            10,
        )
        .unwrap();
    assert_eq!(by_fill.total, 2);
    assert_eq!(by_fill.matches[0].address, CellAddress::new(0, 0));
    assert_eq!(by_fill.matches[1].address, CellAddress::new(2, 2));

    // Combined text + format search ("Total" + bold) matches A1 only, skipping plain A2
    let combined = wb
        .find_cells(
            &[(0, all())],
            &format_query(
                "Total",
                FindFormatFilter {
                    bold: Some(true),
                    ..Default::default()
                },
            ),
            0,
            10,
        )
        .unwrap();
    assert_eq!(combined.total, 1);
    assert_eq!(combined.matches[0].address, CellAddress::new(0, 0));

    // Number format search matches B1
    let by_num = wb
        .find_cells(
            &[(0, all())],
            &format_query(
                "",
                FindFormatFilter {
                    number_format: Some(FindNumberFormatKind::Percent),
                    ..Default::default()
                },
            ),
            0,
            10,
        )
        .unwrap();
    assert_eq!(by_num.total, 1);
    assert_eq!(by_num.matches[0].address, CellAddress::new(0, 1));
}

#[test]
fn replace_format_updates_styles_atomically_and_supports_single_undo_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("Warn".into()));
    wb.set_formula(0, "A2", "=10+5");
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
        StyleScope::Cell,
        CellStyle {
            background: Some(Some("#fff2cc".into())),
            ..Default::default()
        },
    );

    let find = format_query(
        "",
        FindFormatFilter {
            bg_color: Some("#fff2cc".into()),
            ..Default::default()
        },
    );
    let replace_fmt = FindFormatFilter {
        bold: Some(true),
        bg_color: Some("#dcfce7".into()),
        text_color: Some("#166534".into()),
        ..Default::default()
    };

    // Format-only replace preserves formula A2 and text A1 while updating format in 1 history entry
    let report = history
        .replace_by_query_with_format(&mut wb, &[(0, all())], &find, "", Some(&replace_fmt), None)
        .unwrap();
    assert_eq!(report.cells, 2);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("Warn".into()));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(15.0));
    assert_eq!(wb.sheet(0).unwrap().formula_text_at(CellAddress::new(1, 0)).as_deref(), Some("=10+5"));
    let a1_fmt = wb.sheet(0).unwrap().get_format("A1");
    assert!(a1_fmt.bold);
    assert_eq!(a1_fmt.background.as_deref(), Some("#dcfce7"));
    assert_eq!(a1_fmt.color.as_deref(), Some("#166534"));

    // Single Undo restores previous format
    assert!(history.undo(&mut wb).unwrap());
    let restored = wb.sheet(0).unwrap().get_format("A1");
    assert!(!restored.bold);
    assert_eq!(restored.background.as_deref(), Some("#fff2cc"));
    assert_eq!(restored.color, None);

    // Single Redo reapplies new format
    assert!(history.redo(&mut wb).unwrap());
    assert_eq!(wb.sheet(0).unwrap().get_format("A1").background.as_deref(), Some("#dcfce7"));
}

#[test]
fn replace_combined_text_and_format_atomically() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.set_cell(0, "A1", Value::Text("DRAFT".into()));
    wb.set_cell(0, "A2", Value::Text("DRAFT".into()));
    wb.sheet_mut(0).unwrap().patch_format_range(
        CellRange::single(CellAddress::new(0, 0)),
        StyleScope::Cell,
        CellStyle {
            italic: Some(true),
            ..Default::default()
        },
    );

    let find = format_query(
        "DRAFT",
        FindFormatFilter {
            italic: Some(true),
            ..Default::default()
        },
    );
    let replace_fmt = FindFormatFilter {
        italic: Some(false),
        bold: Some(true),
        ..Default::default()
    };

    let report = history
        .replace_by_query_with_format(
            &mut wb,
            &[(0, all())],
            &find,
            "FINAL",
            Some(&replace_fmt),
            None,
        )
        .unwrap();
    assert_eq!(report.cells, 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("FINAL".into()));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("DRAFT".into()));
    assert!(wb.sheet(0).unwrap().get_format("A1").bold);
    assert!(!wb.sheet(0).unwrap().get_format("A1").italic);

    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("DRAFT".into()));
    assert!(wb.sheet(0).unwrap().get_format("A1").italic);
}
