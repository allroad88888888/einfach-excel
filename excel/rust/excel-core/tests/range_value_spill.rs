//! 普通区域在值上下文的 spill；与 Table 引用使用同一投影路径。
use std::collections::HashMap;

use einfach_core::{Value, ValueError};
use einfach_excel_core::{CellAddress, Workbook};

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}

#[test]
fn direct_ranges_spill_and_remain_live_through_an_indirect_consumer() {
    let mut wb = Workbook::new();
    for (cell, value) in [("A1", 10.0), ("A2", 20.0), ("B1", 30.0), ("B2", 40.0)] {
        wb.set_cell(0, cell, Value::Number(value));
    }
    for (target, formula) in [
        ("D1", "=A1:B2"),
        ("G1", "=D1#"),
        ("J1", "=IF(TRUE,A1:B2,0)"),
        ("M1", "=LET(values,A1:B2,values)"),
        ("P1", "=A1:A1"),
    ] {
        assert!(wb.set_formula(0, target, formula));
    }
    for target in ["E2", "H2", "K2", "N2"] {
        assert_eq!(wb.get_cell("Sheet1", target), Value::Number(40.0));
    }
    assert_eq!(wb.get_cell("Sheet1", "P1"), Value::Number(10.0));
    assert_eq!(wb.sheet(0).unwrap().spill_info(addr("P1")), None);
    wb.set_cell(0, "B2", Value::Number(90.0));
    for target in ["E2", "H2", "K2", "N2"] {
        assert_eq!(wb.get_cell("Sheet1", target), Value::Number(90.0));
    }
}

#[test]
fn bulk_install_projects_direct_ranges_before_the_first_read() {
    let mut wb = Workbook::new();
    wb.install_sheet_bulk(
        0,
        [
            (addr("A1"), Value::Number(10.0)),
            (addr("A3"), Value::Number(30.0)),
        ]
        .into_iter()
        .collect(),
        [
            (addr("D1"), "=(A1:A3)".to_owned()),
            (addr("G1"), "=IFERROR(A1:A3,0)".to_owned()),
            (addr("J1"), "=XLOOKUP(99,A1:A3,A1:A3,A1:A3)".to_owned()),
        ]
        .into_iter()
        .collect(),
    )
    .unwrap();
    for anchor in ["D1", "G1", "J1"] {
        assert_eq!(wb.sheet(0).unwrap().spill_info(addr(anchor)), Some((3, 1)));
    }
    for target in ["D3", "G3", "J3"] {
        assert_eq!(wb.get_cell("Sheet1", target), Value::Number(30.0));
    }
    wb.set_cell(0, "A2", Value::Number(20.0));
    for target in ["D2", "G2", "J2"] {
        assert_eq!(wb.get_cell("Sheet1", target), Value::Number(20.0));
    }
}

#[test]
fn cross_sheet_direct_ranges_do_not_depend_on_install_order() {
    for source_first in [false, true] {
        let mut wb = Workbook::new();
        wb.add_sheet("Source");
        let mut payload = vec![
            (
                0,
                HashMap::new(),
                [(addr("D1"), "=Source!$A$1:$A$3".to_owned())]
                    .into_iter()
                    .collect(),
            ),
            (
                1,
                [(addr("A3"), Value::Number(30.0))].into_iter().collect(),
                HashMap::new(),
            ),
        ];
        if source_first {
            payload.reverse();
        }
        wb.install_workbook_bulk(payload).unwrap();
        assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(30.0));
        wb.set_cell(1, "A3", Value::Number(60.0));
        assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(60.0));
    }
}

#[test]
fn ordinary_ranges_keep_spill_obstruction_and_size_limits() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A3", Value::Number(30.0));
    wb.set_cell(0, "D2", Value::Number(99.0));
    assert!(wb.set_formula(0, "D1", "=A1:A3"));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Error(ValueError::Spill));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(99.0));
    wb.clear_cell(0, "D2");
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(30.0));
    // 超大矩形必须在分配前走现有数组上限，不能因增加普通区域取值而绕过。
    wb.add_sheet("Source");
    assert!(wb.set_formula(0, "F1", "=Source!A1:XFD1048576"));
    assert_eq!(
        wb.get_cell("Sheet1", "F1"),
        Value::Error(ValueError::InvalidValue)
    );
    assert_eq!(wb.sheet(0).unwrap().spill_info(addr("F1")), None);
}
