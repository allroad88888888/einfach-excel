use einfach_core::Value;
use einfach_excel_core::{
    CellAddress, CellFormat, CellRange, FindLookIn, FindQuery, NumberFormat, Workbook,
};

fn all() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_575, 16_383))
}

fn query(needle: &str) -> FindQuery {
    FindQuery {
        needle: needle.into(),
        case_sensitive: false,
        whole_cell: false,
        look_in: FindLookIn::Formulas,
    }
}

#[test]
fn scans_offscreen_sparse_cells_without_materializing_empty_grid() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "XFD1048576", Value::Text("offscreen".into()));
    let atoms = wb.debug_total_atom_count(0);
    let page = wb
        .find_cells(&[(0, all())], &query("screen"), 0, 500)
        .unwrap();
    assert_eq!(page.total, 1);
    assert_eq!(page.matches[0].address.to_string(), "XFD1048576");
    assert_eq!((page.matches[0].start, page.matches[0].end), (3, 9));
    assert_eq!(wb.debug_total_atom_count(0), atoms);
}

#[test]
fn pagination_counts_all_occurrences_in_stable_row_major_order() {
    let mut wb = Workbook::new();
    for row in (1..=601).rev() {
        wb.set_cell(0, &format!("B{row}"), Value::Text("a a".into()));
    }
    wb.set_formula(0, "A2", "=\"a\"");
    let first = wb.find_cells(&[(0, all())], &query("a"), 0, 500).unwrap();
    assert_eq!(first.total, 1203);
    assert_eq!(first.matches.len(), 500);
    assert_eq!(first.matches[2].address.to_string(), "A2");
    let last = wb
        .find_cells(&[(0, all())], &query("a"), 1202, 500)
        .unwrap();
    assert_eq!(last.matches.len(), 1);
    assert_eq!(last.matches[0].address.to_string(), "B601");
    assert!(wb
        .find_cells(&[(0, all())], &query("a"), 1203, 10)
        .unwrap()
        .matches
        .is_empty());
}

#[test]
fn unicode_matches_use_utf16_positions_and_original_character_boundaries() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("😀中Ééİ".into()));
    let accents = wb.find_cells(&[(0, all())], &query("É"), 0, 10).unwrap();
    assert_eq!(
        accents
            .matches
            .iter()
            .map(|m| (m.start, m.end))
            .collect::<Vec<_>>(),
        vec![(3, 4), (4, 5)]
    );
    let expanded = wb
        .find_cells(&[(0, all())], &query("i\u{307}"), 0, 10)
        .unwrap();
    assert_eq!((expanded.matches[0].start, expanded.matches[0].end), (5, 6));
    assert_eq!(
        wb.find_cells(&[(0, all())], &query("i"), 0, 10)
            .unwrap()
            .total,
        0
    );
    let emoji = wb.find_cells(&[(0, all())], &query("😀"), 0, 10).unwrap();
    assert_eq!((emoji.matches[0].start, emoji.matches[0].end), (0, 2));
}

#[test]
fn case_and_whole_cell_options_are_independent() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Alpha".into()));
    wb.set_cell(0, "A2", Value::Text("alpha beta".into()));
    let mut q = query("alpha");
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 2);
    q.case_sensitive = true;
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 1);
    q.whole_cell = true;
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 0);
    q.case_sensitive = false;
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 1);
}

#[test]
fn scopes_are_deduplicated_and_ordered_by_workbook_not_caller_order() {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    for sheet in 0..2 {
        wb.set_cell(sheet, "A1", Value::Text("yes".into()));
        wb.set_cell(sheet, "A2", Value::Text("yes".into()));
    }
    let single = CellRange::single(CellAddress::new(0, 0));
    let page = wb
        .find_cells(
            &[(1, single), (0, all()), (0, single)],
            &query("yes"),
            0,
            10,
        )
        .unwrap();
    assert_eq!(page.total, 3);
    assert_eq!(
        page.matches
            .iter()
            .map(|m| (m.sheet, m.address.row))
            .collect::<Vec<_>>(),
        vec![(0, 0), (0, 1), (1, 0)]
    );
}

#[test]
fn formula_mode_searches_sources_and_value_mode_searches_formatted_cross_sheet_results() {
    let mut wb = Workbook::new();
    wb.add_sheet("Other");
    wb.set_cell(1, "A1", Value::Number(1234.5));
    wb.set_formula(0, "A1", "=Other!A1");
    wb.sheet_mut(0).unwrap().set_format(
        "A1",
        CellFormat {
            number_format: NumberFormat::Decimal {
                digits: 2,
                thousands: true,
            },
            ..Default::default()
        },
    );
    assert_eq!(
        wb.find_cells(&[(0, all())], &query("Other!A1"), 0, 10)
            .unwrap()
            .total,
        1
    );
    let q = FindQuery {
        look_in: FindLookIn::Values,
        ..query("1,234.50")
    };
    assert_eq!(wb.find_cells(&[(0, all())], &q, 0, 10).unwrap().total, 1);
    assert_eq!(
        wb.find_cells(&[(0, all())], &query("1,234.50"), 0, 10)
            .unwrap()
            .total,
        0
    );
}

#[test]
fn invalid_inputs_are_rejected_instead_of_searching_a_different_scope() {
    let wb = Workbook::new();
    for targets in [
        vec![],
        vec![(9, all())],
        vec![(
            0,
            CellRange::new(CellAddress::new(2, 0), CellAddress::new(1, 0)),
        )],
    ] {
        assert!(wb.find_cells(&targets, &query("a"), 0, 10).is_err());
    }
    assert!(wb.find_cells(&[(0, all())], &query(""), 0, 10).is_err());
    assert!(wb.find_cells(&[(0, all())], &query("a"), 0, 501).is_err());
    assert!(wb.find_cells(&[(0, all())], &query("a"), 0, 0).is_err());
}
