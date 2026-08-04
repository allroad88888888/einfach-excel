/// The rule wire is a cross-LANGUAGE contract: these objects are the
/// same shape the TypeScript `ColumnFilterRule` union already carries
/// (`spreadsheet-ui-core/src/filter-sort/types.ts`), so a host passes
/// its existing rule objects straight through with no mapping layer.
/// Asserted at the JSON-TEXT level because that is what actually
/// crosses; a struct-level check would not catch a renamed key.
#[test]
fn wasm_column_filter_rule_wire_matches_the_typescript_shape() {
    let rules = vec![
        ColumnFilterRuleJSON::from_rule(&ColumnFilterRule::Equals {
            col_index: 2,
            value: "abc".into(),
            case_sensitive: true,
        }),
        ColumnFilterRuleJSON::from_rule(&ColumnFilterRule::Contains {
            col_index: 0,
            value: "x".into(),
            case_sensitive: false,
        }),
        ColumnFilterRuleJSON::from_rule(&ColumnFilterRule::Range {
            col_index: 1,
            min: Some(1.0),
            max: None,
        }),
        ColumnFilterRuleJSON::from_rule(&ColumnFilterRule::List {
            col_index: 3,
            values: vec!["a".into()],
        }),
    ];
    let json = serde_json::to_string(&rules).expect("serialize");
    assert_eq!(
        json,
        "[{\"kind\":\"equals\",\"colIndex\":2,\"value\":\"abc\",\"caseSensitive\":true},\
             {\"kind\":\"contains\",\"colIndex\":0,\"value\":\"x\"},\
             {\"kind\":\"range\",\"colIndex\":1,\"min\":1.0},\
             {\"kind\":\"list\",\"colIndex\":3,\"values\":[\"a\"]}]",
        "an absent `caseSensitive` means false and an absent bound means unbounded, \
             exactly as the optional TypeScript fields do"
    );

    // ...and it reads back what the host would send, including the
    // optional keys left out.
    let parsed: Vec<ColumnFilterRuleJSON> = serde_json::from_str(
        "[{\"kind\":\"equals\",\"colIndex\":2,\"value\":\"abc\"},\
              {\"kind\":\"range\",\"colIndex\":1,\"max\":9}]",
    )
    .expect("deserialize");
    let back: Vec<ColumnFilterRule> = parsed
        .into_iter()
        .map(ColumnFilterRuleJSON::into_rule)
        .collect();
    assert_eq!(
        back,
        vec![
            ColumnFilterRule::Equals {
                col_index: 2,
                value: "abc".into(),
                case_sensitive: false,
            },
            ColumnFilterRule::Range {
                col_index: 1,
                min: None,
                max: Some(9.0),
            },
        ]
    );
}

/// **The value-getter identity, measured rather than argued.**
///
/// Design §5.2 names the real cross-engine fork: not the predicate but
/// the VALUE GETTER. On the worker path the host's TypeScript predicate
/// compares against `snapshot.display`, which this boundary produces
/// with `value_to_display`. If `Workbook::apply_filter` fed its
/// predicate from any other rendering, the sink-down would silently
/// change which rows a filter hides.
///
/// So: for one cell of every shape the engine can hold, take the string
/// the WIRE emits and use it verbatim as a case-SENSITIVE `equals` rule.
/// Every such row must survive. A one-character difference anywhere in
/// the two renderings hides the row instead, and the assertion names
/// which shape drifted.
#[test]
fn the_predicate_compares_against_the_same_bytes_the_wire_carries() {
    let mut wb = WasmWorkbook::new();
    wb.set_text(0, "A1", "header");
    // Row 1..: one cell shape each. Row 6 is deliberately left EMPTY —
    // the sparse scan never visits it, so its "" comes from the host's
    // `?? ''` fallback rather than from the formatter, and that is the
    // one place the two renderings could disagree by construction.
    wb.set_number(0, "A2", 42.0); // integer-valued double -> "42"
    wb.set_number(0, "A3", 1.5); // fractional -> "1.5"
    wb.set_text(0, "A4", "Mixed Case Text");
    wb.set_boolean(0, "A5", true); // -> "TRUE"
    assert!(wb.set_formula(0, "A7", "=1/0")); // -> "#DIV/0!"
    assert!(wb.set_formula(0, "A8", "=2*21")); // formula result -> "42"
    wb.set_number(0, "A9", 1e20); // beyond the integer cutoff
    wb.set_text(0, "A10", ""); // explicitly empty text

    for row in 1..10u32 {
        let addr = format!("A{}", row + 1);
        let wire = wb.get_cell_display(0, &addr);
        let report = wb
            .workbook
            .apply_filter(
                0,
                &[ColumnFilterRule::Equals {
                    col_index: 0,
                    value: wire.clone(),
                    case_sensitive: true,
                }],
            )
            .expect("apply");
        assert!(
            !report.hidden_rows.contains(&row),
            "row {row} ({addr}) renders as {wire:?} on the wire, but the engine \
                 predicate compared against something else"
        );
    }

    // Non-vacuity: a string that is NOT any cell's rendering hides
    // every judged row, so the loop above is not passing trivially.
    let report = wb
        .workbook
        .apply_filter(
            0,
            &[ColumnFilterRule::Equals {
                col_index: 0,
                value: "not-a-rendering".into(),
                case_sensitive: true,
            }],
        )
        .expect("apply");
    assert_eq!(report.hidden_rows.len(), 9);
}

/// The structured rejection reaches JS as `{ ok: false, code, message }`
/// inside the `Ok` arm, never as a thrown exception — the `sortRange`
/// convention.
#[test]
fn wasm_filter_source_too_large_is_a_structured_rejection() {
    let mut wb = workbook_with_filter();
    wb.set_text(0, "A50001", "far");
    let err = wb
        .workbook
        .apply_filter(0, &[keep_list(&["3"])])
        .unwrap_err();
    assert_eq!(
        err,
        FilterError::SourceTooLarge {
            rows: 50_001,
            columns: 1,
            predicate_cells: 50_001,
        }
    );
    assert!(
        wb.workbook.filter_rules(0).is_empty(),
        "an over-budget source must not activate the filter"
    );
}
