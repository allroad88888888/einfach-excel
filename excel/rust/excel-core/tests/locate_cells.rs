//! 定位依据原生存储身份，不依据可见文字或视口缓存。
use einfach_core::{ArrayData, Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, CellStyle, LocateKind, StyleScope, Workbook};
use std::collections::{BTreeSet, HashMap};
use std::sync::Arc;

fn rect(start: &str, end: &str) -> CellRange {
    CellRange::new(CellAddress::parse(start).unwrap(), CellAddress::parse(end).unwrap())
}
fn addresses(book: &Workbook, kind: LocateKind, range: CellRange) -> BTreeSet<String> {
    let result = book.locate_cells(0, range, kind, 500).unwrap();
    let cells = result.ranges.iter().flat_map(CellRange::iter)
        .map(|addr| addr.to_string()).collect::<BTreeSet<_>>();
    assert_eq!(result.cell_count, cells.len() as u64, "ranges must not overlap");
    cells
}
fn names(values: &[&str]) -> BTreeSet<String> {
    values.iter().map(|value| value.to_string()).collect()
}

#[test]
fn constants_formulas_and_real_blanks_are_disjoint_even_when_the_display_is_empty() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(0.0));
    book.set_cell(0, "B1", Value::Boolean(false));
    book.set_cell(0, "C1", Value::Text("".into()));
    book.set_cell(0, "D1", Value::Error(ValueError::NotAvailable));
    book.set_formula(0, "A2", "=\"\"");
    book.set_formula(0, "B2", "=1/0");
    book.set_formula(0, "C2", "=FALSE");
    book.sheet_mut(0).unwrap().patch_format_range(rect("D2", "D2"), StyleScope::Cell,
        CellStyle { bold: Some(true), ..Default::default() });
    assert_eq!(addresses(&book, LocateKind::Constants, rect("A1", "D2")), names(&["A1", "B1", "C1", "D1"]));
    assert_eq!(addresses(&book, LocateKind::Formulas, rect("A1", "D2")), names(&["A2", "B2", "C2"]));
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("A1", "D2")), names(&["D2"]));
}

#[test]
fn empty_full_sheet_is_one_region_without_allocating_blank_atoms() {
    let book = Workbook::new();
    let all = rect("A1", "XFD1048576");
    let result = book.locate_cells(0, all, LocateKind::Blanks, 1).unwrap();
    assert_eq!(result.ranges, vec![all]);
    assert_eq!(result.cell_count, 17_179_869_184);
    assert_eq!(book.debug_total_atom_count(0), 0);
    assert!(book.locate_cells(0, all, LocateKind::Formulas, 1).unwrap().ranges.is_empty());
}

#[test]
fn sparse_offscreen_formula_is_located_without_materializing_or_evaluating_it() {
    let mut book = Workbook::new();
    book.install_sheet_bulk(0, HashMap::new(), HashMap::from([
        (CellAddress::parse("XFD1048576").unwrap(), "=1+2".to_owned()),
    ])).unwrap();
    let atoms = book.debug_total_atom_count(0);
    let evaluations = book.debug_formula_eval_count(0);
    let result = book.locate_cells(0, rect("A1", "XFD1048576"), LocateKind::Formulas, 500).unwrap();
    assert_eq!(result.ranges, vec![rect("XFD1048576", "XFD1048576")]);
    assert_eq!(book.debug_total_atom_count(0), atoms);
    assert_eq!(book.debug_formula_eval_count(0), evaluations);
    let blanks = book.locate_cells(0, rect("A1", "XFD1048576"), LocateKind::Blanks, 2).unwrap();
    assert_eq!(blanks.ranges.len(), 2);
    assert_eq!(blanks.cell_count, 17_179_869_183);
}

#[test]
fn array_children_inherit_source_identity_including_null_values() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    book.sheet_mut(0).unwrap().set_array("C1", Arc::new(ArrayData::new(3, 1,
        vec![Value::Number(1.0), Value::Null, Value::Text("".into())]))).unwrap();
    assert_eq!(addresses(&book, LocateKind::Formulas, rect("A1", "C3")), names(&["A1", "A2", "A3"]));
    assert_eq!(addresses(&book, LocateKind::Constants, rect("A1", "C3")), names(&["C1", "C2", "C3"]));
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("A1", "C3")), names(&["B1", "B2", "B3"]));
}

#[test]
fn merged_coverage_is_not_a_false_blank_even_when_anchor_is_outside_scope() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("keep".into()));
    book.sheet_mut(0).unwrap().restore_merged_ranges(vec![rect("A1", "C2"), rect("A4", "C5")]).unwrap();
    assert_eq!(addresses(&book, LocateKind::Constants, rect("B1", "C3")), names(&["A1", "B1", "C1", "A2", "B2", "C2"]));
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("B1", "C3")), names(&["A3", "B3", "C3"]));
    assert_eq!(book.locate_cells(0, rect("B1", "C3"), LocateKind::Blanks, 500).unwrap().scope, rect("A1", "C3"));
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("A4", "C5")).len(), 6);
}

#[test]
fn adjacent_runs_coalesce_vertically_and_region_overflow_is_an_error_not_partial_results() {
    let mut book = Workbook::new();
    for address in ["B2", "C2", "B3", "C3", "E5"] {
        book.set_cell(0, address, Value::Number(1.0));
    }
    let result = book.locate_cells(0, rect("A1", "F6"), LocateKind::Constants, 2).unwrap();
    assert_eq!(result.ranges, vec![rect("B2", "C3"), rect("E5", "E5")]);
    assert_eq!(result.cell_count, 5);
    assert!(book.locate_cells(0, rect("A1", "F6"), LocateKind::Constants, 1).unwrap_err().contains("smaller range"));
    assert_eq!(book.get_cell("Sheet1", "E5"), Value::Number(1.0));
}

#[test]
fn invalid_inputs_and_empty_results_are_read_only() {
    let book = Workbook::new();
    for (sheet, range, limit) in [(1, rect("A1", "A1"), 1), (0, rect("B2", "A1"), 1),
        (0, rect("A1", "XFE1"), 1), (0, rect("A1", "A1"), 0), (0, rect("A1", "A1"), 501)] {
        assert!(book.locate_cells(sheet, range, LocateKind::Blanks, limit).is_err());
    }
    assert_eq!(book.debug_total_atom_count(0), 0);
    let result = book.locate_cells(0, rect("A1", "Z100"), LocateKind::Constants, 500).unwrap();
    assert_eq!(result.cell_count, 0);
    assert!(result.ranges.is_empty());
}

#[test]
fn merge_results_never_require_a_bounding_box_that_selects_unmatched_neighbors() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(1.0));
    book.set_cell(0, "C1", Value::Number(2.0));
    book.sheet_mut(0).unwrap().restore_merged_ranges(vec![rect("A1", "B2")]).unwrap();
    let found = book.locate_cells(0, rect("A1", "C2"), LocateKind::Constants, 500).unwrap();
    assert_eq!(found.ranges, vec![rect("A1", "B2"), rect("C1", "C1")]);
    assert_eq!(found.cell_count, 5);
    assert!(book.locate_cells(0, rect("A1", "C2"), LocateKind::Constants, 1).is_err());

    book.set_cell(0, "A1", Value::Null);
    let empty = book.locate_cells(0, rect("A1", "C2"), LocateKind::Blanks, 500).unwrap();
    assert_eq!(empty.ranges, vec![rect("A1", "B2"), rect("C2", "C2")]);
    // 查询范围扩大后又碰到第二个合并格，必须继续包住完整合并格。
    book.sheet_mut(0).unwrap().restore_merged_ranges(vec![rect("A1", "B2"), rect("C3", "D4")]).unwrap();
    let expanded = book.locate_cells(0, rect("B2", "C3"), LocateKind::Blanks, 500).unwrap();
    assert_eq!(expanded.scope, rect("A1", "D4"));
    assert_eq!(expanded.cell_count, 15);
}

#[test]
fn sparse_packing_matches_a_dense_oracle_for_many_small_sheets_and_clipped_queries() {
    let mut seed = 7_u32;
    for _ in 0..48 {
        let mut book = Workbook::new();
        let mut cells = Vec::new();
        for row in 0..8 {
            for col in 0..9 {
                seed = seed.wrapping_mul(1664525).wrapping_add(1013904223);
                let kind = seed % 3;
                let addr = CellAddress::new(row, col);
                if kind == 1 { book.set_cell(0, &addr.to_string(), Value::Number(0.0)); }
                if kind == 2 { book.set_formula(0, &addr.to_string(), "=\"\""); }
                cells.push((addr, kind));
            }
        }
        for query in [rect("A1", "I8"), rect("C2", "F7"), rect("I8", "I8")] {
            for (kind, tag) in [(LocateKind::Blanks, 0), (LocateKind::Constants, 1), (LocateKind::Formulas, 2)] {
                let expected = cells.iter().filter(|(a, k)| *k == tag && query.contains(*a))
                    .map(|(a, _)| a.to_string()).collect();
                assert_eq!(addresses(&book, kind, query), expected);
            }
        }
    }
}

#[test]
fn spill_resize_blocking_and_clearing_use_the_current_native_identity() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    assert_eq!(addresses(&book, LocateKind::Formulas, rect("A2", "A3")), names(&["A2", "A3"]));
    book.set_formula(0, "A1", "=SEQUENCE(1)");
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("A1", "A3")), names(&["A2", "A3"]));
    book.set_cell(0, "A2", Value::Text("block".into()));
    book.set_formula(0, "A1", "=SEQUENCE(3)");
    assert_eq!(addresses(&book, LocateKind::Formulas, rect("A1", "A3")), names(&["A1"]));
    assert_eq!(addresses(&book, LocateKind::Constants, rect("A1", "A3")), names(&["A2"]));
    assert_eq!(addresses(&book, LocateKind::Blanks, rect("A1", "A3")), names(&["A3"]));
    book.set_cell(0, "A2", Value::Null);
    assert_eq!(addresses(&book, LocateKind::Formulas, rect("A1", "A3")), names(&["A1", "A2", "A3"]));
}
