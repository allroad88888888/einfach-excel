//! 删除只改引用节点，保留可编辑公式源以及范围尚存的部分。
use einfach_core::{Value, ValueError};
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::{CellAddress, Sheet, Workbook};
use std::collections::HashMap;

fn seed(formula: &str, warm: bool) -> Sheet {
    let mut sheet = Sheet::new();
    sheet.bulk_load(|loader| {
        for row in 1..=4 {
            loader.set_cell(&format!("A{row}"), Value::Number(row as f64));
        }
        loader.set_formula("C10", formula);
    });
    if warm {
        sheet.get_cell("C10");
    }
    sheet
}

#[test]
fn deleting_a_local_point_does_not_erase_the_formula_or_its_error_handler() {
    for warm in [false, true] {
        let mut sheet = seed("=IFERROR(A2,9)", warm);
        sheet.delete_row(1, 1);
        assert_eq!(
            sheet.get_formula("C9").as_deref(),
            Some("=IFERROR(#REF!,9)")
        );
        assert_eq!(sheet.get_cell("C9"), Value::Number(9.0));
        sheet.set_formula("D9", "=ISFORMULA(C9)");
        assert_eq!(sheet.get_cell("D9"), Value::Boolean(true));
    }
}

#[test]
fn local_range_endpoints_inside_a_deleted_band_shrink_to_the_survivors() {
    for warm in [false, true] {
        for (at, count, value) in [(0, 2, 7.0), (1, 2, 5.0), (2, 2, 3.0)] {
            let mut sheet = seed("=SUM(A1:A4)", warm);
            sheet.delete_row(at, count);
            assert_eq!(sheet.get_formula("C8").as_deref(), Some("=SUM(A1:A2)"));
            assert_eq!(sheet.get_cell("C8"), Value::Number(value));
        }
    }
}

#[test]
fn deleted_whole_column_ranges_preserve_the_remaining_columns() {
    for warm in [false, true] {
        let mut sheet = Sheet::new();
        // 公式在汇总列之外；批量导入使冷路径真正保持未求值状态。
        sheet.bulk_load(|loader| {
            loader.set_cell("A1", Value::Number(10.0));
            loader.set_formula("E10", "=SUM(A:C)");
        });
        if warm {
            sheet.get_cell("E10");
        }
        sheet.delete_col(0, 1);
        assert_eq!(sheet.get_formula("D10").as_deref(), Some("=SUM(A:B)"));
        assert_eq!(sheet.get_cell("D10"), Value::Number(0.0));
    }
}

#[test]
fn deleted_spill_reference_keeps_a_reenterable_source() {
    for warm in [false, true] {
        let mut sheet = seed("=IFERROR(SUM(A1#),9)", false);
        sheet.set_formula("A1", "=SEQUENCE(3)");
        if warm {
            sheet.get_cell("C10");
        }
        sheet.delete_row(0, 1);
        assert_eq!(
            sheet.get_formula("C9").as_deref(),
            Some("=IFERROR(SUM(#REF!),9)")
        );
        assert_eq!(sheet.get_cell("C9"), Value::Number(9.0));
    }
}

#[test]
fn dead_reference_fallback_remains_lazy_and_keeps_invalid_sources_invalid() {
    let mut sheet = seed("=IFERROR(A2,9)", false);
    sheet.delete_row(1, 1);
    assert_eq!(sheet.debug_dep_graph_stats().formula_count, 0);
    assert_eq!(sheet.debug_point_dependency_key_count(), 0);
    let mut sources = HashMap::new();
    sources.insert(CellAddress::new(5, 2), "=A2+".to_owned());
    let mut workbook = Workbook::new();
    workbook
        .install_sheet_bulk(0, HashMap::new(), sources)
        .unwrap();
    workbook.delete_rows(0, 1, 1);
    assert_eq!(
        workbook.sheet(0).unwrap().get_cell("C5"),
        Value::Error(ValueError::InvalidValue)
    );
}

#[test]
fn references_to_empty_edge_cells_become_errors_consistently_when_inserted_outside() {
    for warm in [false, true] {
        for (source, edit, address) in [
            (
                "=IFERROR(A1048576,9)",
                ShiftEdit::RowInsert { at: 0, count: 1 },
                "C11",
            ),
            (
                "=IFERROR(XFD1,9)",
                ShiftEdit::ColInsert { at: 0, count: 1 },
                "D10",
            ),
            (
                "=IFERROR(SUM(1048576:1048576),9)",
                ShiftEdit::RowInsert { at: 0, count: 1 },
                "C11",
            ),
            (
                "=IFERROR(SUM(XFD:XFD),9)",
                ShiftEdit::ColInsert { at: 0, count: 1 },
                "D10",
            ),
        ] {
            let mut wb = Workbook::new();
            wb.sheet_mut(0).unwrap().bulk_load(|loader| {
                loader.set_formula("C10", source);
            });
            if warm {
                wb.get_cell("Sheet1", "C10");
            }
            wb.try_structural_edit(0, edit).unwrap();
            let formula = wb.sheet(0).unwrap().get_formula(address).unwrap();
            assert!(formula.contains("#REF!"), "warm={warm}: {formula}");
            assert_eq!(wb.get_cell("Sheet1", address), Value::Number(9.0));
        }
    }
}
