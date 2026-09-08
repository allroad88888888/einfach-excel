//! 行列结构操作的显式跨表引用随动；同时覆盖已求值与停泊公式。
use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Workbook};
use std::collections::HashMap;

fn seed(source: &str, warm: bool) -> Workbook {
    let mut wb = Workbook::new();
    wb.add_sheet("Data");
    wb.bulk_load(|loader| {
        for row in 1..=4 {
            loader.set_cell(1, &format!("A{row}"), Value::Number(row as f64));
        }
        loader.set_cell(1, "C3", Value::Number(20.0));
        loader.set_formula(0, "A1", source);
    });
    if warm {
        wb.get_cell("Sheet1", "A1");
    }
    wb
}

#[test]
fn all_four_axis_edits_keep_point_references_on_the_original_data() {
    for warm in [false, true] {
        for (operation, expected) in [
            (0, "=Data!C5"),
            (1, "=Data!C2"),
            (2, "=Data!E3"),
            (3, "=Data!B3"),
        ] {
            let mut wb = seed("=Data!C3", warm);
            match operation {
                0 => wb.insert_rows(1, 0, 2),
                1 => wb.delete_rows(1, 0, 1),
                2 => wb.insert_columns(1, 0, 2),
                _ => wb.delete_columns(1, 0, 1),
            }
            assert_eq!(
                wb.sheet(0).unwrap().get_formula("A1").as_deref(),
                Some(expected)
            );
            assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(20.0));
        }
    }
}

#[test]
fn deleted_cross_sheet_point_keeps_iferror_as_a_formula() {
    for warm in [false, true] {
        let mut wb = seed("=IFERROR(Data!A2,7)", warm);
        wb.delete_rows(1, 1, 1);
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=IFERROR(#REF!,7)")
        );
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
    }
}

#[test]
fn range_deletion_shrinks_surviving_parts_instead_of_destroying_the_formula() {
    for warm in [false, true] {
        for (at, count, total, reference) in [
            (0, 2, 7.0, "Data!A1:A2"),
            (1, 2, 5.0, "Data!A1:A2"),
            (2, 2, 3.0, "Data!A1:A2"),
            (0, 4, 0.0, "#REF!"),
        ] {
            let mut wb = seed("=IFERROR(SUM(Data!A1:A4),0)", warm);
            wb.delete_rows(1, at, count);
            assert!(wb
                .sheet(0)
                .unwrap()
                .get_formula("A1")
                .unwrap()
                .contains(reference));
            assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(total));
        }
    }
}

#[test]
fn whole_axis_refs_only_move_on_their_bounded_axis() {
    for warm in [false, true] {
        let mut wb = seed("=SUM(Data!A:A)", warm);
        wb.insert_rows(1, 0, 2);
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=SUM(Data!A:A)")
        );
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
        wb.insert_columns(1, 0, 1);
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("=SUM(Data!B:B)")
        );
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    }
}

#[test]
fn qualified_self_references_move_once_while_other_sheet_references_stay_put() {
    let mut wb = seed("=Data!A2", false);
    wb.bulk_load(|loader| {
        loader.set_formula(1, "C1", "=Data!A2");
        loader.set_formula(1, "D1", "=Sheet1!A1");
    });
    wb.insert_rows(1, 0, 1);
    assert_eq!(
        wb.sheet(1).unwrap().get_formula("C2").as_deref(),
        Some("=Data!A3")
    );
    assert_eq!(
        wb.sheet(1).unwrap().get_formula("D2").as_deref(),
        Some("=Sheet1!A1")
    );
    assert_eq!(wb.get_cell("Data", "C2"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Data", "D2"), Value::Number(2.0));
}

#[test]
fn quoted_names_absolute_markers_and_string_literals_keep_their_meaning() {
    for warm in [false, true] {
        let mut wb = seed("=Data!A2", false);
        assert!(wb.rename_sheet(1, "O'Brien Data"));
        wb.bulk_load(|loader| {
            loader.set_formula(0, "A1", "='O''Brien Data'!$A$2");
            loader.set_formula(0, "B1", "=\"'O''Brien Data'!A2\"&\"\"\"Data!A1\"");
        });
        if warm {
            wb.get_cell("Sheet1", "A1");
            wb.get_cell("Sheet1", "B1");
        }
        let text = wb.sheet(0).unwrap().get_formula("B1");
        wb.insert_rows(1, 0, 1);
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("A1").as_deref(),
            Some("='O''Brien Data'!$A$3")
        );
        assert_eq!(wb.sheet(0).unwrap().get_formula("B1"), text);
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(2.0));
    }
}

#[test]
fn structural_rewrite_does_not_hydrate_or_evaluate_a_parked_cross_sheet_chain() {
    let mut wb = seed("=Data!A2", false);
    let formulas = (0..2_000)
        .map(|row| (CellAddress::new(row, 1), "=Data!A2*2".into()))
        .collect();
    wb.install_sheet_bulk(0, HashMap::new(), formulas).unwrap();
    let before = wb.debug_formula_eval_count(0);
    wb.insert_rows(1, 0, 1);
    let sheet = wb.sheet(0).unwrap();
    assert_eq!(sheet.debug_dep_graph_stats().formula_count, 0);
    assert_eq!(sheet.debug_point_dependency_key_count(), 0);
    assert_eq!(wb.debug_formula_eval_count(0), before);
    assert_eq!(sheet.get_formula("B2000").as_deref(), Some("=Data!A3*2"));
    assert_eq!(wb.get_cell("Sheet1", "B2000"), Value::Number(4.0));
}

#[test]
fn downstream_formulas_recalculate_after_a_shifted_reference_is_written() {
    let mut wb = seed("=Data!A2", true);
    wb.set_formula(0, "B1", "=A1*2");
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(4.0));
    wb.insert_rows(1, 0, 1);
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(4.0));
    wb.set_cell(1, "A3", Value::Number(9.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(18.0));
    wb.delete_rows(1, 2, 1);
    assert_eq!(
        wb.get_cell("Sheet1", "B1"),
        Value::Error(ValueError::InvalidRef)
    );
}

#[test]
fn deleting_a_spill_anchor_preserves_a_parseable_error_formula_in_both_states() {
    for warm in [false, true] {
        for source in ["=IFERROR(SUM(Data!A1#),7)", "=IFERROR(SUM(Data!A1 #),7)"] {
            let mut wb = Workbook::new();
            wb.add_sheet("Data");
            wb.set_formula(1, "A1", "=SEQUENCE(3)");
            // 直接停泊引用公式，避免 Workbook 导入的数组投影尾提前将其求值。
            wb.sheet_mut(0).unwrap().bulk_load(|loader| {
                assert!(loader.set_formula("A1", source));
            });
            assert_eq!(
                wb.sheet(0).unwrap().debug_dep_graph_stats().formula_count,
                0
            );
            if warm {
                assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(6.0));
            }
            wb.delete_rows(1, 0, 1);
            assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
            let source = wb.sheet(0).unwrap().get_formula("A1").unwrap();
            assert_eq!(source, "=IFERROR(SUM(#REF!),7)");
            assert!(wb.set_formula(0, "B1", &source));
            assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(7.0));
        }
    }
}

#[test]
fn subscribed_cross_sheet_values_are_not_invalidated_by_a_pure_relocation() {
    use std::cell::Cell;
    use std::rc::Rc;
    let mut wb = seed("=Data!A2", true);
    let calls = Rc::new(Cell::new(0));
    let copy = calls.clone();
    let _subscription = wb.sheet_mut(0).unwrap().subscribe_cell("A1", move || {
        copy.set(copy.get() + 1);
    });
    wb.insert_rows(1, 0, 1);
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(2.0));
    assert_eq!(
        calls.get(),
        0,
        "relocation must not publish an intermediate value"
    );
    wb.set_cell(1, "A3", Value::Number(8.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(8.0));
    assert_eq!(calls.get(), 1);
}
