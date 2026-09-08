//! 插删预检必须拒绝越界损失，且不求值、不局部移动其它表的引用。
use einfach_core::Value;
use einfach_excel_core::shift::ShiftEdit;
use einfach_excel_core::{CellAddress, CellRange, CellStyle, StyleScope, Workbook};

const ROWS: u32 = 1_048_576;
const COLS: u32 = 16_384;

fn point(row: u32, col: u32) -> CellRange {
    let addr = CellAddress::new(row, col);
    CellRange::new(addr, addr)
}

#[test]
fn invalid_geometry_is_rejected_before_any_reference_or_value_changes() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(7.0));
    let other = wb.add_sheet("Other");
    wb.set_formula(other, "A1", "=Sheet1!A1");
    for edit in [
        ShiftEdit::RowInsert { at: ROWS, count: 1 },
        ShiftEdit::ColInsert { at: COLS, count: 1 },
        ShiftEdit::RowDelete {
            at: 1,
            count: u32::MAX,
        },
        ShiftEdit::ColDelete {
            at: COLS - 1,
            count: 2,
        },
    ] {
        assert!(wb.try_structural_edit(0, edit).is_err());
        assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(7.0));
        assert_eq!(
            wb.sheet(other).unwrap().get_formula("A1").as_deref(),
            Some("=Sheet1!A1")
        );
    }
    assert!(wb
        .try_structural_edit(99, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
}

#[test]
fn insertion_refuses_to_push_a_primitive_or_parked_formula_past_the_edge() {
    for rows in [true, false] {
        for formula in [false, true] {
            let mut wb = Workbook::new();
            let edge = if rows { "A1048576" } else { "XFD1" };
            wb.sheet_mut(0).unwrap().bulk_load(|loader| {
                if formula {
                    loader.set_formula(edge, "=123");
                } else {
                    loader.set_cell(edge, Value::Number(123.0));
                }
            });
            let edit = if rows {
                ShiftEdit::RowInsert { at: 0, count: 1 }
            } else {
                ShiftEdit::ColInsert { at: 0, count: 1 }
            };
            assert!(wb.try_structural_edit(0, edit).is_err());
            assert_eq!(
                wb.sheet(0).unwrap().debug_dep_graph_stats().formula_count,
                0
            );
            assert_eq!(wb.debug_formula_eval_count(0), 0);
            assert_eq!(wb.get_cell("Sheet1", edge), Value::Number(123.0));
        }
    }
}

#[test]
fn blank_cell_formats_axis_styles_and_dimensions_are_not_discardable() {
    for rows in [true, false] {
        for kind in ["cell", "axis", "size"] {
            let mut wb = Workbook::new();
            let target = if rows {
                point(ROWS - 1, 0)
            } else {
                point(0, COLS - 1)
            };
            let sheet = wb.sheet_mut(0).unwrap();
            if kind == "size" {
                if rows {
                    sheet.set_row_height(ROWS - 1, 80);
                } else {
                    sheet.set_col_width(COLS - 1, 200);
                }
            } else {
                let scope = if kind == "cell" {
                    StyleScope::Cell
                } else if rows {
                    StyleScope::Row
                } else {
                    StyleScope::Column
                };
                sheet.patch_format_range(
                    target,
                    scope,
                    CellStyle {
                        bold: Some(true),
                        ..Default::default()
                    },
                );
            }
            let before = sheet.snapshot_format_range(target);
            let width = sheet.col_width(COLS - 1);
            let edit = if rows {
                ShiftEdit::RowInsert { at: 0, count: 1 }
            } else {
                ShiftEdit::ColInsert { at: 0, count: 1 }
            };
            assert!(wb.try_structural_edit(0, edit).is_err(), "{rows}/{kind}");
            let sheet = wb.sheet(0).unwrap();
            assert_eq!(sheet.snapshot_format_range(target), before);
            assert_eq!(sheet.col_width(COLS - 1), width);
        }
    }
}

#[test]
fn hidden_metadata_and_empty_table_geometry_also_block_overflow() {
    let mut wb = Workbook::new();
    wb.hide_rows(0, &[ROWS - 1]);
    assert!(wb
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
    assert_eq!(wb.list_hidden_rows(0), vec![ROWS - 1]);
    wb.unhide_rows(0, &[ROWS - 1]);
    let table = CellRange::new(CellAddress::new(ROWS - 2, 0), CellAddress::new(ROWS - 1, 0));
    wb.define_table(Some("Bottom"), 0, table, false).unwrap();
    assert!(wb
        .try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .is_err());
}

#[test]
fn unrelated_axis_metadata_does_not_prevent_a_valid_insert() {
    let mut wb = Workbook::new();
    wb.sheet_mut(0).unwrap().set_col_width(COLS - 1, 200);
    wb.try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
    wb.sheet_mut(0).unwrap().set_row_height(ROWS - 1, 80);
    wb.sheet_mut(0).unwrap().clear_col_width(COLS - 1);
    wb.try_structural_edit(0, ShiftEdit::ColInsert { at: 0, count: 1 })
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().row_height(ROWS - 1), Some(80));
}

#[test]
fn the_last_valid_row_and_column_can_be_deleted_explicitly() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "XFD1048576", Value::Number(8.0));
    wb.try_structural_edit(
        0,
        ShiftEdit::RowDelete {
            at: ROWS - 1,
            count: 1,
        },
    )
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "XFD1048576"), Value::Null);
    wb.set_cell(0, "XFD1", Value::Number(9.0));
    wb.try_structural_edit(
        0,
        ShiftEdit::ColDelete {
            at: COLS - 1,
            count: 1,
        },
    )
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "XFD1"), Value::Null);
}

#[test]
fn zero_count_and_old_void_entry_points_share_the_safe_boundary() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1048576", Value::Number(3.0));
    wb.try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 0 })
        .unwrap();
    wb.insert_rows(0, 0, 1);
    wb.delete_rows(0, 1, u32::MAX);
    assert_eq!(wb.get_cell("Sheet1", "A1048576"), Value::Number(3.0));
}

#[test]
fn observing_an_empty_edge_cell_does_not_turn_it_into_overflowing_data() {
    let mut wb = Workbook::new();
    let _subscription = wb.sheet_mut(0).unwrap().subscribe_cell("A1048576", || {});
    wb.try_structural_edit(0, ShiftEdit::RowInsert { at: 0, count: 1 })
        .unwrap();
}
