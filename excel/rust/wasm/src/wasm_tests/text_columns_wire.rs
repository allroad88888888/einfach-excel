fn text_columns_wire_request() -> serde_json::Value {
    serde_json::json!({
        "sheet": 0,
        "source": {"rowStart": 0, "colStart": 0, "rowEnd": 99, "colEnd": 0},
        "destination": {"row": 0, "col": 2},
        "rowCount": 100, "colCount": 8,
        "mode": {"kind": "delimited", "delimiters": [",", "、"],
            "mergeConsecutive": true, "qualifier": "\""}
    })
}

#[test]
fn text_columns_wire_maps_unicode_options_and_canvas_without_sampling_input() {
    let req: TextColumnsRequestJSON = serde_json::from_value(text_columns_wire_request()).unwrap();
    let req = req.native();
    assert_eq!(req.source.end.row, 99);
    assert_eq!((req.row_count, req.col_count), (100, 8));
    assert_eq!(req.destination, CellAddress::new(0, 2));
    assert_eq!(
        req.mode,
        TextColumnsMode::Delimited {
            delimiters: vec![',', '、'],
            merge_consecutive: true,
            qualifier: Some('"'),
        }
    );
    let mut fixed = text_columns_wire_request();
    fixed["mode"] = serde_json::json!({"kind": "fixedWidth", "breakpoints": [2, 5]});
    let req: TextColumnsRequestJSON = serde_json::from_value(fixed).unwrap();
    assert_eq!(
        req.native().mode,
        TextColumnsMode::FixedWidth {
            breakpoints: vec![2, 5]
        }
    );
}

#[test]
fn text_columns_wire_rejects_unsupported_modes_and_non_scalar_delimiters() {
    for mode in [
        serde_json::json!({"kind": "fixedWidth", "breakpoints": [1.5]}),
        serde_json::json!({"kind": "fixedWidth", "breakpoints": [-1]}),
        serde_json::json!({"kind": "csv", "breakpoints": [2]}),
        serde_json::json!({"kind": "delimited", "delimiters": ["ab"], "mergeConsecutive": false}),
        serde_json::json!({"kind": "delimited", "delimiters": [","], "mergeConsecutive": false, "qualifier": ""}),
        serde_json::json!({"kind": "fixedWidth", "breakpoints": [2], "extra": true}),
    ] {
        let mut request = text_columns_wire_request();
        request["mode"] = mode;
        assert!(serde_json::from_value::<TextColumnsRequestJSON>(request).is_err());
    }
    for invalid in [
        serde_json::json!(-1),
        serde_json::json!(0.1),
        serde_json::json!(4294967296_u64),
    ] {
        let mut request = text_columns_wire_request();
        request["destination"]["row"] = invalid;
        assert!(serde_json::from_value::<TextColumnsRequestJSON>(request).is_err());
    }
}

#[test]
fn text_columns_wire_preview_matches_native_output_without_writing() {
    let mut workbook = Workbook::new();
    workbook.set_cell(0, "A1", Value::Text("001、北京".into()));
    let request: TextColumnsRequestJSON =
        serde_json::from_value(text_columns_wire_request()).unwrap();
    let preview = workbook.preview_text_columns(&request.native()).unwrap();
    let wire = serde_json::to_value(TextColumnsPreviewJSON::from(preview)).unwrap();
    assert_eq!(
        wire["target"],
        serde_json::json!({"rowStart": 0, "colStart": 2, "rowEnd": 99, "colEnd": 3})
    );
    assert_eq!(wire["sample"][0], serde_json::json!(["001", "北京"]));
    assert_eq!(wire["sampleTruncated"], true);
    assert_eq!(wire["overwrittenCells"], 0);
    assert_eq!(workbook.get_cell("Sheet1", "C1"), Value::Null);
}
