//! 名称校验、公式解析与查询必须认同同一个名字。
use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn source() -> (Workbook, CellRange) {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "A2", Value::Number(20.0));
    (
        wb,
        CellRange::new(CellAddress::new(0, 0), CellAddress::new(1, 0)),
    )
}

#[test]
fn accepted_names_parse_read_and_spill_through_normal_formulas() {
    for name in [
        "销售额",
        "Équipe",
        "_Sales",
        r"\Sales",
        "Sales.Quarter",
        "NewSales",
        "A1销售",
        "A1.销售",
        "_1",
    ] {
        let (mut wb, range) = source();
        wb.define_named_range(name, 0, range).unwrap();
        assert!(wb.set_formula(0, "C1", &format!("=SUM({name})")), "{name}");
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0), "{name}");
        assert!(wb.set_formula(0, "E1", &format!("={name}")), "{name}");
        assert_eq!(wb.get_cell("Sheet1", "E2"), Value::Number(20.0), "{name}");
        wb.set_cell(0, "A2", Value::Number(40.0));
        assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(50.0), "{name}");
    }
}

#[test]
fn unicode_names_are_case_insensitive_in_lookup_update_and_delete() {
    let (mut wb, range) = source();
    wb.define_named_range("équipe", 0, range).unwrap();
    assert!(wb.set_formula(0, "C1", "=SUM(ÉQUIPE)"));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    wb.define_named_range("ÉQUIPE", 0, CellRange::single(CellAddress::new(0, 0)))
        .unwrap();
    assert_eq!(wb.named_names().collect::<Vec<_>>(), vec!["ÉQUIPE"]);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(10.0));
    assert!(wb.undefine_name("éQUIPE"));
    assert!(wb.named_names().next().is_none());
}

#[test]
fn long_ascii_names_are_not_misread_as_overflowing_column_addresses() {
    let (mut wb, range) = source();
    let name = "Z".repeat(255);
    wb.define_named_range(&name, 0, range).unwrap();
    assert!(wb.set_formula(0, "C1", &format!("=SUM({name})")));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    assert!(wb.define_named_range(&"Z".repeat(256), 0, range).is_err());
}

#[test]
fn character_limit_is_not_utf8_byte_limit_and_reference_names_are_rejected() {
    let (mut wb, range) = source();
    let limit = "额".repeat(255);
    wb.define_named_range(&limit, 0, range).unwrap();
    assert!(wb.set_formula(0, "C1", &format!("=SUM({limit})")));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(30.0));
    assert!(wb.define_named_range(&"额".repeat(256), 0, range).is_err());
    for name in [
        "",
        "1Sales",
        "has space",
        "R",
        "c",
        "R1C1",
        "r15c4",
        "A1",
        "Z$100",
        "A/B",
        r"A\B",
        ".Sales",
    ] {
        assert!(wb.define_named_range(name, 0, range).is_err(), "{name}");
    }
    assert_eq!(wb.named_names().count(), 1);
}

#[test]
fn let_and_lambda_local_names_shadow_ranges_case_insensitively() {
    let (mut wb, range) = source();
    wb.define_named_range("équipe", 0, range).unwrap();
    for (cell, formula, expected) in [
        ("C1", "=LET(ÉQUIPE,3,SUM(équipe))", 3.0),
        ("C2", "=LAMBDA(ÉQUIPE,SUM(équipe))(4)", 4.0),
        ("C3", "=LAMBDA(ÉQUIPE,IF(ISOMITTED(équipe),5,0))()", 5.0),
    ] {
        assert!(wb.set_formula(0, cell, formula));
        assert_eq!(wb.get_cell("Sheet1", cell), Value::Number(expected));
    }
}

#[test]
fn lexical_shadow_does_not_create_a_false_named_range_cycle() {
    let (mut wb, range) = source();
    wb.define_named_range("Sales", 0, range).unwrap();
    assert!(wb.set_formula(0, "A1", "=LET(Sales,3,sales+1)"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(4.0));
    assert!(wb.set_formula(0, "A2", "=LAMBDA(Sales,SALES+1)(4)"));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(5.0));
    wb.define_name("calc", "=LAMBDA(Sales,Sales+2)").unwrap();
    assert!(wb.set_formula(0, "A2", "=calc(5)"));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(7.0));
    // 绑定值在局部名生效前求值；这里真正读取包含自己的工作簿范围，仍应拒绝。
    assert!(!wb.set_formula(0, "A1", "=LET(Sales,SUM(sales),Sales)"));
}

#[test]
fn structural_source_scanner_does_not_rewrite_address_shaped_parts_of_names() {
    use einfach_excel_core::shift::{rewrite_parked_source, ShiftEdit, SourceRewrite};
    for name in ["A1销售", "A1.销售", "_A1", r"\A1", "销售A1"] {
        let (mut wb, range) = source();
        wb.define_named_range(name, 0, range).unwrap();
        let formula = format!("=SUM({name})+A1");
        let expected = format!("=SUM({name})+A2");
        assert_eq!(
            rewrite_parked_source(&formula, ShiftEdit::RowInsert { at: 0, count: 1 }),
            SourceRewrite::Rewritten(expected.clone()),
            "{name}"
        );
        assert!(wb.set_formula(0, "C1", &formula));
        wb.insert_rows(0, 0, 1);
        // 已解析公式沿既有 renderer 写回，二元表达式会带一层括号。
        assert_eq!(
            wb.sheet(0).unwrap().get_formula("C2"),
            Some(format!("=(SUM({name})+A2)"))
        );
        assert_eq!(wb.get_cell("Sheet1", "C2"), Value::Number(40.0));
    }
}
