use einfach_core::Value;
use einfach_excel_core::cell_input::editable_cell_text_with_order;
use einfach_excel_core::data_validation::{
    DataValidationKind, DataValidationOperator, DataValidationRule,
};
use einfach_excel_core::workbook::ConditionalFormatRuleEntry;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellRange, DateInputOrder, LocateKind, NumberFormat, Workbook,
};

fn addr(s: &str) -> CellAddress {
    CellAddress::parse(s).unwrap()
}

fn range(s: &str) -> CellRange {
    let (a, b) = s.split_once(':').unwrap_or((s, s));
    CellRange::new(addr(a), addr(b))
}

#[test]
fn locale_date_input_order_parses_mdy_and_dmy_without_breaking_default_ymd() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "03/04/2024").unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Text("03/04/2024".into()));

    wb.set_date_input_order(DateInputOrder::Mdy);
    wb.set_cell_input(0, "A2", "03/04/2024").unwrap();
    wb.set_cell_input(0, "A3", "31/03/2024").unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A2"), "2024-03-04");
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("31/03/2024".into()));

    wb.set_date_input_order(DateInputOrder::Dmy);
    wb.set_cell_input(0, "B2", "03/04/2024").unwrap();
    wb.set_cell_input(0, "B3", "31/03/2024").unwrap();
    wb.set_cell_input(0, "B4", "2024-05-06").unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("B2"), "2024-04-03");
    assert_eq!(wb.sheet(0).unwrap().formatted_display("B3"), "2024-03-31");
    assert_eq!(wb.sheet(0).unwrap().formatted_display("B4"), "2024-05-06");
    assert_eq!(
        wb.sheet(0).unwrap().get_format("B3").number_format,
        NumberFormat::Date("yyyy-mm-dd".into())
    );
    assert_eq!(
        editable_cell_text_with_order(&Value::Text("31/03/2024".into()), "", DateInputOrder::Dmy),
        "'31/03/2024"
    );
}

#[test]
fn internal_hyperlinks_normalize_and_retarget_on_sheet_rename_with_undo_redo() {
    let mut wb = Workbook::new();
    let mut history = WorkbookHistory::default();
    wb.add_sheet("Sheet2");
    history
        .change_hyperlink(&mut wb, 0, addr("A1"), Some("#sheet2!a1"), Some("Go A1"))
        .unwrap();
    history
        .change_hyperlink(&mut wb, 0, addr("A2"), Some("#Sheet2!B5:D10"), None)
        .unwrap();
    history
        .change_hyperlink(&mut wb, 0, addr("A3"), Some("#'Sales Orders'!C3"), None)
        .unwrap();
    history
        .change_hyperlink(&mut wb, 0, addr("A4"), Some("#SampleAmounts"), None)
        .unwrap();
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A1")), Some("#Sheet2!A1"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A2")), Some("#Sheet2!B5:D10"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A4")), Some("#SampleAmounts"));

    for bad in ["#", "#1+2", "#SUM(A1)", "#'unterminated!A1", "#'not_a_sheet'", "#TRUE"] {
        assert!(history.change_hyperlink(&mut wb, 0, addr("B1"), Some(bad), None).is_err(), "{bad}");
    }

    history.edit_sheet(&mut wb, Some(1), "Sales Orders").unwrap();
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A1")), Some("#'Sales Orders'!A1"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A2")), Some("#'Sales Orders'!B5:D10"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A3")), Some("#'Sales Orders'!C3"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A4")), Some("#SampleAmounts"));

    // 撤销重命名只还原原本指向 Sheet2 的链接，原本悬空指向 'Sales Orders' 的 A3 保持原样！
    history.undo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A1")), Some("#Sheet2!A1"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A2")), Some("#Sheet2!B5:D10"));
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A3")), Some("#'Sales Orders'!C3"));

    history.redo(&mut wb).unwrap();
    assert_eq!(wb.sheet(0).unwrap().hyperlink(addr("A1")), Some("#'Sales Orders'!A1"));
}

#[test]
fn locate_special_matches_same_rules_and_direct_vs_all_levels_dependencies() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "10").unwrap();
    wb.set_cell_input(0, "B1", "=A1*2").unwrap();
    wb.set_cell_input(0, "C1", "=B1+5").unwrap();
    wb.set_cell_input(0, "D1", "=C1-1").unwrap();

    let full = range("A1:Z50");
    let direct_prec = wb
        .locate_cells_with_context(0, full, range("D1"), addr("D1"), LocateKind::Precedents, 500)
        .unwrap();
    assert_eq!(direct_prec.ranges, vec![range("C1")]);

    let all_prec = wb
        .locate_cells_with_context(0, full, range("D1"), addr("D1"), LocateKind::PrecedentsAll, 500)
        .unwrap();
    assert_eq!(all_prec.ranges, vec![range("A1:C1")]);

    let direct_dep = wb
        .locate_cells_with_context(0, full, range("A1"), addr("A1"), LocateKind::Dependents, 500)
        .unwrap();
    assert_eq!(direct_dep.ranges, vec![range("B1")]);

    let all_dep = wb
        .locate_cells_with_context(0, full, range("A1"), addr("A1"), LocateKind::DependentsAll, 500)
        .unwrap();
    assert_eq!(all_dep.ranges, vec![range("B1:D1")]);

    // 条件格式：全部 vs 相同规则
    wb.set_conditional_format_rule(
        0,
        0,
        ConditionalFormatRuleEntry {
            id: "r1".into(),
            row_start: 2,
            row_end: 3,
            col_start: 0,
            col_end: 1,
            additional_ranges: vec![range("D3:D4")],
            priority: 1,
            rule_json: r#"{"type":"gt","value":5}"#.into(),
        },
    )
    .unwrap();
    wb.set_conditional_format_rule(
        0,
        1,
        ConditionalFormatRuleEntry {
            id: "r2".into(),
            row_start: 2,
            row_end: 2,
            col_start: 5,
            col_end: 5,
            additional_ranges: vec![],
            priority: 2,
            rule_json: r#"{"type":"lt","value":0}"#.into(),
        },
    )
    .unwrap();
    let cf_all = wb
        .locate_cells_with_context(0, full, full, addr("A3"), LocateKind::ConditionalFormat, 500)
        .unwrap();
    assert_eq!(cf_all.cell_count, 7);
    let cf_same = wb
        .locate_cells_with_context(
            0,
            full,
            full,
            addr("A3"),
            LocateKind::ConditionalFormatSame,
            500,
        )
        .unwrap();
    assert_eq!(cf_same.ranges, vec![range("A3:B4"), range("D3:D4")]);

    // 数据验证：全部 vs 相同规则
    let rule_a = DataValidationRule {
        kind: DataValidationKind::WholeNumber { min: 1.0, max: 10.0 },
        ignore_blank: true,
        operator: DataValidationOperator::Between,
        options: Default::default(),
    };
    let rule_b = DataValidationRule {
        kind: DataValidationKind::List {
            items: vec!["Yes".into(), "No".into()],
        },
        ignore_blank: true,
        operator: DataValidationOperator::Between,
        options: Default::default(),
    };
    wb.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("A6:B6"), Some(rule_a.clone()))
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("D6:D7"), Some(rule_a))
        .unwrap();
    wb.sheet_mut(0)
        .unwrap()
        .set_data_validation(range("F6"), Some(rule_b))
        .unwrap();
    let dv_all = wb
        .locate_cells_with_context(0, full, full, addr("A6"), LocateKind::DataValidation, 500)
        .unwrap();
    assert_eq!(dv_all.cell_count, 5);
    let dv_same = wb
        .locate_cells_with_context(0, full, full, addr("A6"), LocateKind::DataValidationSame, 500)
        .unwrap();
    assert_eq!(dv_same.ranges, vec![range("A6:B6"), range("D6:D7")]);
}
