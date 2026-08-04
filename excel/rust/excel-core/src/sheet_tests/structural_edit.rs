//! 插删行列之后 sheet 各层状态如何随动。
//!
//! 拆自 `sheet.rs` 的 `mod tests`；层级与 import 约定见 `mod.rs`。

use super::super::*;
use einfach_core::ValueError;

// === Phase 4 tests ===

#[test]
fn insert_row_shifts_data_and_refs() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A5", Value::Number(50.0));
    sheet.set_formula("B1", "=A5*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(100.0));

    // Insert one row at index 2 (between row 2 and row 3).
    sheet.insert_row(2, 1);
    // Old A5 should now be at A6.
    assert_eq!(sheet.get_cell("A6"), Value::Number(50.0));
    // B1 formula was retargeted: A5 → A6 inside the expression.
    // Render adds defensive parens around binops; just check it parses
    // and references A6 by value.
    assert!(sheet
        .get_formula("B1")
        .map(|s| s.contains("A6") && !s.contains("A5"))
        .unwrap_or(false));
    // And still computes correctly.
    assert_eq!(sheet.get_cell("B1"), Value::Number(100.0));
}

#[test]
fn delete_row_invalidates_refs_into_deleted_band() {
    let mut sheet = Sheet::new();
    sheet.set_cell("A5", Value::Number(50.0));
    sheet.set_formula("B1", "=A5*2");
    assert_eq!(sheet.get_cell("B1"), Value::Number(100.0));

    // Delete row 5 (0-based = the row that A5 lives in is row index 4).
    sheet.delete_row(4, 1);
    // The formula referencing the deleted row should produce #REF!.
    assert_eq!(sheet.get_cell("B1"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn structural_edit_batches_store_propagation() {
    const ROW_COUNT: u32 = 120;

    let mut sheet = Sheet::new();
    for row in 1..=ROW_COUNT {
        sheet.set_cell(&format!("A{row}"), Value::Number(row as f64));
        assert!(sheet.set_formula(&format!("B{row}"), &format!("=A{row}+1")));
        assert_eq!(
            sheet.get_cell(&format!("B{row}")),
            Value::Number(row as f64 + 1.0)
        );
    }

    let before = sheet.store.debug_flush_visit_count();
    sheet.delete_row(0, 1);
    let visits = sheet.store.debug_flush_visit_count() - before;

    assert_eq!(sheet.get_cell("B1"), Value::Number(3.0));
    assert_eq!(
        sheet.get_cell(&format!("B{}", ROW_COUNT - 1)),
        Value::Number(ROW_COUNT as f64 + 1.0)
    );
    assert!(
        visits <= ROW_COUNT as usize * 20,
        "one structural transaction must not repeatedly walk the formula graph: {visits} visits"
    );
}

#[test]
fn insert_col_shifts_data_and_refs() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C1", Value::Number(30.0));
    sheet.set_formula("A2", "=C1+1");
    assert_eq!(sheet.get_cell("A2"), Value::Number(31.0));

    // Insert column at index 1 (between A and B → original B becomes C, C→D).
    sheet.insert_col(1, 1);
    assert_eq!(sheet.get_cell("D1"), Value::Number(30.0));
    assert!(sheet
        .get_formula("A2")
        .map(|s| s.contains("D1") && !s.contains("C1"))
        .unwrap_or(false));
    assert_eq!(sheet.get_cell("A2"), Value::Number(31.0));
}

#[test]
fn delete_col_invalidates_refs() {
    let mut sheet = Sheet::new();
    sheet.set_cell("C1", Value::Number(30.0));
    sheet.set_formula("A2", "=C1+1");
    sheet.delete_col(2, 1); // delete column C (index 2)
    assert_eq!(sheet.get_cell("A2"), Value::Error(ValueError::InvalidRef));
}

#[test]
fn row_and_col_size_facts_stay_sparse() {
    let mut sheet = Sheet::new();

    assert_eq!(sheet.row_height(1), None);
    assert_eq!(sheet.col_width(2), None);

    assert!(sheet.set_row_height(1, 27));
    assert!(sheet.set_col_width(2, 144));
    assert_eq!(sheet.row_height(1), Some(27));
    assert_eq!(sheet.col_width(2), Some(144));
    assert_eq!(sheet.row_heights_in_range(0, 10), vec![(1, 27)]);
    assert_eq!(sheet.col_widths_in_range(0, 10), vec![(2, 144)]);

    assert!(sheet.set_row_height(5, 32));
    assert!(sheet.set_col_width(7, 180));
    assert_eq!(sheet.row_heights_in_range(2, 10), vec![(5, 32)]);
    assert_eq!(sheet.col_widths_in_range(3, 10), vec![(7, 180)]);

    assert!(sheet.clear_row_height(1));
    assert!(sheet.clear_col_width(2));
    assert_eq!(sheet.all_row_heights(), vec![(5, 32)]);
    assert_eq!(sheet.all_col_widths(), vec![(7, 180)]);
}

#[test]
fn row_and_col_size_facts_shift_with_structural_edits() {
    let mut sheet = Sheet::new();
    assert!(sheet.set_row_height(1, 24));
    assert!(sheet.set_row_height(4, 36));
    assert!(sheet.set_col_width(1, 120));
    assert!(sheet.set_col_width(4, 200));

    sheet.insert_row(2, 2);
    sheet.insert_col(2, 2);
    assert_eq!(sheet.all_row_heights(), vec![(1, 24), (6, 36)]);
    assert_eq!(sheet.all_col_widths(), vec![(1, 120), (6, 200)]);

    sheet.delete_row(1, 2);
    sheet.delete_col(1, 2);
    assert_eq!(sheet.all_row_heights(), vec![(4, 36)]);
    assert_eq!(sheet.all_col_widths(), vec![(4, 200)]);
}

#[test]
fn format_survives_row_insert() {
    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        bold: true,
        ..Default::default()
    };
    sheet.set_cell("A5", Value::Number(1.0));
    sheet.set_format("A5", fmt.clone());
    sheet.insert_row(2, 1);
    // A5 → A6.
    assert_eq!(sheet.get_format("A6"), fmt);
    assert_eq!(sheet.get_format("A5"), CellFormat::default());
}

#[test]
fn format_survives_col_insert() {
    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        italic: true,
        ..Default::default()
    };
    sheet.set_format("C1", fmt.clone());
    sheet.insert_col(1, 1);
    // C1 → D1.
    assert_eq!(sheet.get_format("D1"), fmt);
    assert_eq!(sheet.get_format("C1"), CellFormat::default());
}

#[test]
fn format_dropped_on_row_delete() {
    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        bold: true,
        ..Default::default()
    };
    sheet.set_format("A5", fmt);
    // Delete row index 4 (= row 5 in 1-based).
    sheet.delete_row(4, 1);
    assert_eq!(sheet.get_format("A5"), CellFormat::default());
    assert_eq!(sheet.get_format("A4"), CellFormat::default());
}

#[test]
fn format_dropped_on_col_delete() {
    let mut sheet = Sheet::new();
    let fmt = CellFormat {
        italic: true,
        ..Default::default()
    };
    sheet.set_format("C1", fmt);
    sheet.delete_col(2, 1);
    assert_eq!(sheet.get_format("C1"), CellFormat::default());
}
