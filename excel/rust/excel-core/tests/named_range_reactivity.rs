//! 命名区域必须引用源地址，不能冻结成创建时的值快照。

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn range(first: u32, last: u32) -> CellRange {
    CellRange::new(CellAddress::new(first, 0), CellAddress::new(last, 0))
}

#[test]
fn source_changes_update_aggregates_and_reference_functions() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.define_named_range("Sales", 0, range(0, 1)).unwrap();
    for (address, formula, expected) in [
        ("C1", "=SUM(sales)", 30.0),
        ("C2", "=SUMIF(Sales,\">15\",Sales)", 20.0),
        ("C3", "=INDEX(Sales,2)", 20.0),
        ("C4", "=ROWS(Sales)", 2.0),
        ("C5", "=LET(Sales,3,SUM(Sales))", 3.0),
    ] {
        assert!(wb.set_formula(0, address, formula));
        assert_eq!(
            wb.get_cell("Sheet1", address),
            Value::Number(expected),
            "{formula}"
        );
    }
    wb.set_cell(0, "A2", Value::Number(40.0));
    for (address, expected) in [("C1", 50.0), ("C2", 40.0), ("C3", 40.0), ("C5", 3.0)] {
        assert_eq!(wb.get_cell("Sheet1", address), Value::Number(expected));
    }
}

#[test]
fn redefining_and_deleting_update_existing_formula_dependencies() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A5", Value::Number(50.0));
    assert!(wb.set_formula(0, "C1", "=SUM(Sales)"));
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    wb.define_named_range("Sales", 0, range(0, 0)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
    wb.define_named_range("Sales", 0, range(4, 4)).unwrap();
    wb.set_cell(0, "A1", Value::Number(99.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0));
    wb.set_cell(0, "A5", Value::Number(60.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(60.0));
    assert!(wb.undefine_name("sales"));
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    wb.define_name_value("Sales", Value::Number(7.0)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(7.0));
}

#[test]
fn stable_sheet_identity_survives_rename_move_but_not_recreation() {
    let mut wb = Workbook::new();
    let source = wb.add_sheet("Source");
    wb.set_cell(source, "A1", Value::Number(42.0));
    wb.define_named_range("Sales", source, range(0, 0)).unwrap();
    assert!(wb.set_formula(0, "C1", "=Sales+1"));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(43.0));
    assert!(wb.rename_sheet(source, "Renamed"));
    assert!(wb.move_sheet(source, 0));
    wb.set_cell(0, "A1", Value::Number(44.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(45.0));
    wb.remove_sheet(0).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidRef)
    );
    let replacement = wb.add_sheet("Renamed");
    wb.set_cell(replacement, "A1", Value::Number(100.0));
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidRef)
    );
}

#[test]
fn invalid_definition_preserves_previous_reference() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.define_named_range("Sales", 0, range(0, 0)).unwrap();
    assert!(wb.define_named_range("Sales", 99, range(0, 0)).is_err());
    assert!(wb
        .define_named_range("Sales", 0, range(0, 1_048_576))
        .is_err());
    for name in ["A1", "R", "C", "SUM", "invalid name"] {
        assert!(
            wb.define_named_range(name, 0, range(0, 0)).is_err(),
            "{name}"
        );
    }
    assert_eq!(
        wb.named_range("Sales"),
        Ok(Some(("Sheet1".into(), range(0, 0))))
    );
    // 值接口不物化范围；只有正常公式引用负责读取单元格。
    assert_eq!(wb.get_named("Sales"), None);
    assert!(wb.set_formula(0, "C1", "=Sales"));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
    assert_eq!(wb.named_names().collect::<Vec<_>>(), vec!["Sales"]);
}

#[test]
fn named_reference_cycles_are_rejected_like_explicit_references() {
    let mut wb = Workbook::new();
    wb.define_named_range("Sales", 0, range(0, 1)).unwrap();
    assert!(!wb.set_formula(0, "A1", "=SUM(Sales)"));
    // 与直接 =SUM(A1:A2) 相同：拒绝安装循环公式并写入明确错误。
    assert_eq!(
        wb.get_cell("Sheet1", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
}

#[test]
fn bare_named_range_spills_and_resizes_without_leaving_old_cells() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    wb.set_cell(0, "A3", Value::Number(30.0));
    wb.define_named_range("Sales", 0, range(0, 1)).unwrap();
    assert!(wb.set_formula(0, "C1", "=Sales"));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.0));
    wb.set_cell(0, "A2", Value::Number(25.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(25.0));
    wb.define_named_range("Sales", 0, range(0, 2)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Number(30.0));
    wb.define_named_range("Sales", 0, range(0, 0)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Null);
    wb.define_named_range("Sales", 0, range(0, 1)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(25.0));
    wb.undefine_name("Sales");
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
}

#[test]
fn large_sparse_named_range_does_not_materialize_empty_cells() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A100000", Value::Number(20.0));
    wb.define_named_range("Sales", 0, range(0, 99999)).unwrap();
    assert!(wb.set_formula(0, "C1", "=SUM(Sales)"));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    assert!(wb.sheet(0).unwrap().debug_materialized_cell_atom_count() < 20);
    wb.set_cell(0, "A50000", Value::Number(5.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(35.0));
    assert!(wb.sheet(0).unwrap().debug_materialized_cell_atom_count() < 20);
}

#[test]
fn defining_an_unbound_name_installs_its_existing_spill_formula() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    assert!(wb.set_formula(0, "C1", "=Sales"));
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidName)
    );
    wb.define_named_range("Sales", 0, range(0, 1)).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.0));
}

#[test]
fn removing_source_sheet_clears_cross_sheet_spill_targets() {
    let mut wb = Workbook::new();
    let source = wb.add_sheet("Source");
    wb.set_cell(source, "A1", Value::Number(10.0));
    wb.set_cell(source, "A2", Value::Number(20.0));
    wb.define_named_range("Sales", source, range(0, 1)).unwrap();
    assert!(wb.set_formula(0, "C1", "=Sales"));
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(20.0));
    wb.remove_sheet(source).unwrap();
    assert_eq!(
        wb.get_cell("Sheet1", "C1"),
        Value::Error(ValueError::InvalidRef)
    );
    assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Null);
}
