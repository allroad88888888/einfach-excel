fn quick_formula_request() -> serde_json::Value {
    serde_json::json!({ "sheet": 0,
        "range": {"rowStart": 2, "colStart": 0, "rowEnd": 2, "colEnd": 0},
        "function": "sum", "rowCount": 100, "colCount": 16 })
}

#[test]
fn quick_formula_wire_returns_a_read_only_native_draft_for_each_function() {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Number(2.0));
    book.set_cell(0, "A2", Value::Number(4.0));
    for (function, name) in [("sum", "SUM"), ("average", "AVERAGE"), ("count", "COUNT")] {
        let mut json = quick_formula_request(); json["function"] = serde_json::json!(function);
        let wire: QuickFormulaRequestJSON = serde_json::from_value(json).unwrap();
        let result = serde_json::to_value(QuickFormulaSuggestionJSON::from(wire.suggest(&book).unwrap())).unwrap();
        assert_eq!(result["target"], serde_json::json!({"row": 2, "col": 0}));
        assert_eq!(result["input"], format!("={name}(A1:A2)"));
        assert_eq!(book.get_cell("Sheet1", "A3"), Value::Null);
    }
}

#[test]
fn quick_formula_wire_rejects_unknown_fields_functions_and_invalid_numbers() {
    for (key, value) in [("sheet", serde_json::json!(-1)), ("function", serde_json::json!("eval")),
        ("rowCount", serde_json::json!(0.5)), ("colCount", serde_json::json!("16")),
        ("extra", serde_json::json!(true))] {
        let mut json = quick_formula_request(); json[key] = value;
        assert!(serde_json::from_value::<QuickFormulaRequestJSON>(json).is_err());
    }
    for value in [serde_json::json!(-1), serde_json::json!(0.5), serde_json::json!(null)] {
        let mut json = quick_formula_request(); json["range"]["rowStart"] = value;
        assert!(serde_json::from_value::<QuickFormulaRequestJSON>(json).is_err());
    }
}
