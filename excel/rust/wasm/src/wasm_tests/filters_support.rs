fn workbook_with_filter() -> WasmWorkbook {
    let mut wb = WasmWorkbook::new();
    let _ = wb.add_sheet("Second");
    for i in 0..5u32 {
        wb.set_number(0, &format!("A{}", i + 1), (i + 1) as f64);
    }
    assert!(wb.set_formula(0, "C1", "=SUBTOTAL(9, A1:A5)"));
    wb
}

fn keep_list(values: &[&str]) -> ColumnFilterRule {
    ColumnFilterRule::List {
        col_index: 0,
        values: values.iter().map(|v| (*v).to_string()).collect(),
    }
}
