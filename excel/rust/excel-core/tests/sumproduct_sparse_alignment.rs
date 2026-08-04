//! Whole-axis SUMPRODUCT integration coverage through the sparse Workbook
//! provider. The data are deliberately discontinuous so this proves absolute
//! position alignment rather than zipping the emitted sparse cells.

use einfach_core::Value;
use einfach_excel_core::Workbook;

#[test]
fn whole_columns_keep_sparse_positions_aligned() {
    let mut workbook = Workbook::new();
    for (row, (left, right)) in [
        (1, (1.0, 10.0)),
        (2, (2.0, 20.0)),
        (3, (3.0, 30.0)),
        (4, (4.0, 40.0)),
        (5, (5.0, 50.0)),
    ] {
        workbook.set_cell(0, &format!("F{row}"), Value::Number(left));
        workbook.set_cell(0, &format!("G{row}"), Value::Number(right));
    }
    workbook.set_cell(0, "F120000", Value::Number(9.0));
    workbook.set_cell(0, "G100000", Value::Number(7.0));
    workbook.set_cell(0, "G120000", Value::Number(90.0));

    workbook.set_formula(0, "Z1", "=SUMPRODUCT(F:F,G:G)");
    workbook.set_formula(0, "Z2", "=SUM(F:F)");

    assert_eq!(workbook.get_cell("Sheet1", "Z1"), Value::Number(1360.0));
    assert_eq!(workbook.get_cell("Sheet1", "Z2"), Value::Number(24.0));
}
