//! 汇总下拉框读取真实公式，不能回显一份过期函数配置。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, TotalsFunction, Workbook};

#[test]
fn current_function_is_derived_from_the_same_formula_parser() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Text("Product".into()));
    wb.set_cell(0, "B1", Value::Text("Amount".into()));
    wb.set_cell(0, "B2", Value::Number(10.0));
    wb.define_table(
        Some("Inventory"),
        0,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(2, 1)),
        true,
    )
    .unwrap();
    assert_eq!(wb.table_total_functions("Inventory").unwrap(), vec![]);
    wb.set_table_totals_row("Inventory", true).unwrap();
    assert_eq!(
        wb.table_total_functions("Inventory").unwrap(),
        vec![Some(TotalsFunction::None), Some(TotalsFunction::Sum)]
    );
    for source in [
        "= subtotal(101, inventory[amount] )",
        "=SUBTOTAL(101,[Amount])",
    ] {
        assert!(wb.set_formula(0, "B4", source));
        assert_eq!(
            wb.table_total_functions("Inventory").unwrap()[1],
            Some(TotalsFunction::Average)
        );
    }
    for source in [
        "=SUM(Inventory[Amount])",
        "=SUBTOTAL(109,Inventory[Product])",
        "=SUBTOTAL(109,Inventory[#All])",
        "=SUBTOTAL(9,Inventory[Amount])",
        "=SUBTOTAL(109,Other[Amount])",
    ] {
        wb.set_formula(0, "B4", source);
        assert_eq!(
            wb.table_total_functions("Inventory").unwrap()[1],
            None,
            "{source}"
        );
    }
    wb.set_cell(0, "B4", Value::Text("Manual total".into()));
    assert_eq!(wb.table_total_functions("Inventory").unwrap()[1], None);
    wb.clear_cell(0, "B4");
    assert_eq!(
        wb.table_total_functions("Inventory").unwrap()[1],
        Some(TotalsFunction::None)
    );
}
