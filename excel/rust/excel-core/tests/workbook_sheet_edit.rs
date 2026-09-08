use einfach_core::Value;
use einfach_excel_core::Workbook;

#[test]
fn add_blank_sheet_and_validate_names_without_mutation() {
    let mut wb = Workbook::new();
    assert_eq!(wb.edit_sheet(None, "Budget"), Ok(1));
    assert_eq!(wb.get_cell("Budget", "A1"), Value::Null);
    for name in ["", " ", "budget", "History", "bad/name", "bad[name", "'bad", "bad'", "bad\nname", "12345678901234567890123456789012"] {
        assert!(wb.edit_sheet(None, name).is_err(), "{name}");
        assert_eq!(wb.sheet_count(), 2);
    }
    assert!(wb.edit_sheet(Some(1), "sHeEt1").is_err());
    assert_eq!(wb.name(1), Some("Budget"));
    assert_eq!(wb.edit_sheet(Some(1), " Budget "), Ok(1));
    assert_eq!(wb.edit_sheet(Some(1), "BUDGET"), Ok(1));
    assert!(wb.edit_sheet(Some(99), "Missing").is_err());
}

#[test]
fn rename_keeps_hydrated_and_parked_static_references_live() {
    let mut wb = Workbook::new();
    let data = wb.edit_sheet(None, "Data").unwrap();
    wb.set_cell(data, "A1", Value::Number(5.0));
    wb.set_cell(data, "A2", Value::Number(7.0));
    assert!(wb.set_formula(0, "A1", "=Data!$A$1*2"));
    assert!(wb.set_formula(0, "B1", "=SUM(Data!A1:A2)"));
    assert!(wb.set_formula(0, "C1", "=IF(TRUE,Data!A2,0)"));
    assert!(wb.set_formula(0, "D1", "=\"Data!A1\""));
    assert!(wb.set_formula(data, "B1", "=Data!A1+1"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    assert_eq!(wb.edit_sheet(Some(data), "O'Brien Data"), Ok(data));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(10.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(12.0));
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Number(7.0));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Text("Data!A1".into()));
    assert_eq!(wb.get_cell("O'Brien Data", "B1"), Value::Number(6.0));
    assert_eq!(wb.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=('O''Brien Data'!$A$1*2)"));
    wb.set_cell(data, "A1", Value::Number(8.0));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(16.0));
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(15.0));
}

#[test]
fn failed_rename_preserves_cells_formulas_and_other_sheets() {
    let mut wb = Workbook::new();
    let data = wb.edit_sheet(None, "Data").unwrap();
    wb.set_cell(data, "A1", Value::Number(9.0));
    wb.set_formula(0, "A1", "=Data!A1");
    assert!(wb.edit_sheet(Some(data), "Sheet1").is_err());
    assert_eq!(wb.name(data), Some("Data"));
    assert_eq!(wb.get_cell("Sheet1", "A1"), Value::Number(9.0));
    assert_eq!(wb.sheet(0).unwrap().get_formula("A1").as_deref(), Some("=Data!A1"));
}
