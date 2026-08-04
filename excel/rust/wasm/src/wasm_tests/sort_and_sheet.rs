#[test]
fn sort_range_wire_parses_a1_string() {
    let range = SortRangeWireJSON::A1("A1:B3".into())
        .into_range()
        .unwrap()
        .normalize();
    assert_eq!(range.start, CellAddress::new(0, 0));
    assert_eq!(range.end, CellAddress::new(2, 1));
}

#[test]
fn sort_range_wire_single_cell_a1_is_one_by_one() {
    let range = SortRangeWireJSON::A1("C5".into()).into_range().unwrap();
    assert_eq!(range.start, CellAddress::new(4, 2));
    assert_eq!(range.end, CellAddress::new(4, 2));
}

#[test]
fn sort_range_wire_parses_bounds_object() {
    let range = SortRangeWireJSON::Bounds {
        start_row: 1,
        start_col: 2,
        end_row: 4,
        end_col: 3,
    }
    .into_range()
    .unwrap();
    assert_eq!(range.start, CellAddress::new(1, 2));
    assert_eq!(range.end, CellAddress::new(4, 3));
}

#[test]
fn sort_range_wire_rejects_garbage_a1() {
    assert!(SortRangeWireJSON::A1("not-a-cell".into())
        .into_range()
        .is_err());
}

#[test]
fn sort_key_wire_direction_and_case_defaults() {
    // Missing direction → ascending; caseSensitive default false.
    let k = SortKeyWireJSON {
        col: 3,
        direction: None,
        case_sensitive: false,
    }
    .into_key();
    assert_eq!(k.col, 3);
    assert_eq!(k.direction, SortDirection::Ascending);
    assert!(!k.case_sensitive);

    // Both short and long descending spellings map to Descending.
    for spelling in ["desc", "descending"] {
        let k = SortKeyWireJSON {
            col: 0,
            direction: Some(spelling.into()),
            case_sensitive: true,
        }
        .into_key();
        assert_eq!(k.direction, SortDirection::Descending, "{spelling}");
        assert!(k.case_sensitive);
    }

    // Unknown spelling falls back to ascending (never panics).
    let k = SortKeyWireJSON {
        col: 0,
        direction: Some("sideways".into()),
        case_sensitive: false,
    }
    .into_key();
    assert_eq!(k.direction, SortDirection::Ascending);
}

#[test]
fn sort_range_report_json_maps_permutation_to_pairs() {
    let report = SortRangeReport {
        moved_rows: 2,
        moved_cells: 3,
        row_permutation: vec![(0, 1), (1, 0)],
    };
    let json = SortRangeReportJSON::from_report(&report);
    assert!(json.ok);
    assert_eq!(json.moved_rows, 2);
    assert_eq!(json.moved_cells, 3);
    assert_eq!(json.row_permutation, vec![[0, 1], [1, 0]]);
}

#[test]
fn wasm_sheet_basic() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 10.0);
    assert_eq!(sheet.get_display("A1"), "10");
    assert_eq!(sheet.get_number("A1"), 10.0);
    assert_eq!(sheet.get_type("A1"), "number");
}

#[test]
fn wasm_sheet_text() {
    let mut sheet = WasmSheet::new();
    sheet.set_text("A1", "hello");
    assert_eq!(sheet.get_display("A1"), "hello");
    assert_eq!(sheet.get_type("A1"), "text");
}

#[test]
fn wasm_sheet_formula() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 10.0);
    sheet.set_number("B1", 20.0);
    sheet.set_formula("C1", "=A1+B1");
    assert_eq!(sheet.get_display("C1"), "30");
    assert_eq!(sheet.get_number("C1"), 30.0);
}

#[test]
fn wasm_sheet_formula_updates() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 5.0);
    sheet.set_formula("B1", "=A1*2");
    assert_eq!(sheet.get_number("B1"), 10.0);

    sheet.set_number("A1", 100.0);
    assert_eq!(sheet.get_number("B1"), 200.0);
}

#[test]
fn wasm_sheet_transitive_formula_chain_updates() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 5.0);
    sheet.set_formula("B1", "=A1*2");
    sheet.set_formula("C1", "=B1+1");
    assert_eq!(sheet.get_number("C1"), 11.0);

    sheet.set_number("A1", 7.0);
    assert_eq!(sheet.get_number("C1"), 15.0);
}

#[test]
fn wasm_sheet_clear_range_clears_sparse_hits() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 1.0);
    sheet.set_number("C3", 3.0);
    sheet.set_formula("D1", "=A1+1");
    assert_eq!(sheet.get_display("D1"), "2");

    assert_eq!(sheet.clear_range(0, 0, 1, 1), 1);

    assert_eq!(sheet.get_type("A1"), "null");
    assert_eq!(sheet.get_display("C3"), "3");
    assert_eq!(sheet.get_display("D1"), "1");
}

#[test]
fn wasm_sheet_error() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 10.0);
    sheet.set_number("B1", 0.0);
    sheet.set_formula("C1", "=A1/B1");
    assert!(sheet.is_error("C1"));
    assert_eq!(sheet.get_display("C1"), "#DIV/0!");
}

/// `#TYPE!` and `#ARGS!` are tokens the WIRE accepts but the UI never
/// emits. Both display entry points on `WasmSheet` have to agree on that,
/// including `formatted_display`, which reaches a different formatter in
/// the engine (`Sheet::formatted_display`) than `get_display` does.
#[test]
fn wasm_wrong_type_never_reaches_a_cell_display() {
    for (token, variant) in [
        ("#TYPE!", ValueError::WrongType),
        ("#ARGS!", ValueError::WrongArgCount),
    ] {
        let mut sheet = WasmSheet::new();
        // Accepted on the way in — old snapshots and old formula text
        // must keep parsing.
        sheet.set_error("A1", token);
        assert!(sheet.is_error("A1"));
        assert_eq!(
            sheet.sheet.peek_value(CellAddress::parse("A1").unwrap()),
            Value::Error(variant),
            "the diagnostic variant must survive the round trip ({token})"
        );
        // Never shown on the way out, through either formatter.
        assert_eq!(sheet.get_display("A1"), "#VALUE!", "{token}");
        assert_eq!(sheet.formatted_display("A1"), "#VALUE!", "{token}");
    }

    // A real argument-type rejection takes the same path.
    let mut sheet = WasmSheet::new();
    sheet.set_text("A1", "four");
    sheet.set_formula("B1", "=SQRT(A1)");
    assert_eq!(sheet.get_display("B1"), "#VALUE!");
    assert_eq!(sheet.formatted_display("B1"), "#VALUE!");

    // So does a real argument-COUNT rejection.
    sheet.set_formula("C1", "=LEN()");
    assert_eq!(sheet.get_display("C1"), "#VALUE!");
    assert_eq!(sheet.formatted_display("C1"), "#VALUE!");

    // `#CYCLE!` is the non-Excel code this repo deliberately KEEPS —
    // see the registry on `format::error_display_token`.
    sheet.set_formula("D1", "=D1+1");
    assert_eq!(sheet.get_display("D1"), "#CYCLE!");
    assert_eq!(sheet.formatted_display("D1"), "#CYCLE!");
}

#[test]
fn wasm_calc_error_token_round_trips() {
    assert_eq!(error_token_to_value_error("#NULL!"), Some(ValueError::Null));
    assert_eq!(
        error_token_to_value_error("#N/A"),
        Some(ValueError::NotAvailable)
    );
    assert_eq!(error_token_to_value_error("#CALC!"), Some(ValueError::Calc));
    assert_eq!(value_error_from_display("#NULL!"), ValueError::Null);
    assert_eq!(value_error_from_display("#N/A"), ValueError::NotAvailable);
    assert_eq!(value_error_from_display("#CALC!"), ValueError::Calc);
    assert_eq!(value_to_display(&Value::Error(ValueError::Calc)), "#CALC!");

    let mut sheet = WasmSheet::new();
    sheet.set_error("A1", "#CALC!");
    assert!(sheet.is_error("A1"));
    assert_eq!(sheet.get_display("A1"), "#CALC!");
    sheet.set_error("A2", "#N/A");
    assert!(sheet.is_error("A2"));
    assert_eq!(sheet.get_display("A2"), "#N/A");
    sheet.set_error("A3", "#NULL!");
    assert!(sheet.is_error("A3"));
    assert_eq!(sheet.get_display("A3"), "#NULL!");
}

#[test]
fn wasm_sheet_null_cell() {
    let mut sheet = WasmSheet::new();
    assert_eq!(sheet.get_display("A1"), "");
    assert_eq!(sheet.get_type("A1"), "null");
}

#[test]
fn wasm_display_integer() {
    assert_eq!(value_to_display(&Value::Number(42.0)), "42");
}

#[test]
fn wasm_display_float() {
    assert_eq!(value_to_display(&Value::Number(3.14)), "3.14");
}

#[test]
fn wasm_display_boolean() {
    assert_eq!(value_to_display(&Value::Boolean(true)), "TRUE");
    assert_eq!(value_to_display(&Value::Boolean(false)), "FALSE");
}

#[test]
fn wasm_sheet_sum_function() {
    let mut sheet = WasmSheet::new();
    sheet.set_number("A1", 1.0);
    sheet.set_number("A2", 2.0);
    sheet.set_number("A3", 3.0);
    sheet.set_formula("A4", "=SUM(A1,A2,A3)");
    assert_eq!(sheet.get_number("A4"), 6.0);
}
