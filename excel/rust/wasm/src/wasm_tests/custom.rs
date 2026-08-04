#[test]
fn async_registry_entry_is_flagged_and_never_sync_dispatched() {
    let registry = WasmCustomFormulaRegistry::new();
    registry.register_async("slow");
    // Case-insensitive flag, name-only entry.
    assert!(registry.is_async("SLOW"));
    assert!(registry.is_async("slow"));
    assert!(!registry.is_async("OTHER"));
    assert_eq!(registry.count(), 1);
    // Defensive: a bypassed sync dispatch of an async name fails
    // loudly as #NAME? instead of silently invoking nothing.
    assert_eq!(
        registry.lookup("SLOW", &[]),
        Some(Value::Error(ValueError::InvalidName))
    );
    // Unregister clears the flag.
    assert!(registry.unregister("SLOW"));
    assert!(!registry.is_async("SLOW"));
}

/// 把「JS 侧能不能造出 Array」和「引擎侧拿到 Array 会不会溢出」拆开验证：
/// 这里用一个**原生** registry 直接返回 `Value::Array`，完全绕开 JS
/// （JsValue 只能在 wasm32 下构造，原生 `cargo test` 摸不到）。
#[test]
fn custom_formula_returning_array_spills_through_the_existing_path() {
    use einfach_core::ArrayData;

    #[derive(Debug)]
    struct Reg;
    // SAFETY: 单线程测试，仅为满足 trait bound。
    unsafe impl Send for Reg {}
    unsafe impl Sync for Reg {}
    impl CustomFunctionRegistry for Reg {
        fn lookup(&self, _name: &str, _args: &[Value]) -> Option<Value> {
            Some(Value::Array(Arc::new(ArrayData::new(
                2,
                2,
                vec![
                    Value::Number(1.0),
                    Value::Number(2.0),
                    Value::Number(3.0),
                    Value::Number(4.0),
                ],
            ))))
        }
    }

    let mut wb = Workbook::new();
    wb.set_custom_function_registry(Some(Arc::new(Reg) as Arc<dyn CustomFunctionRegistry>));
    assert!(wb.set_formula(0, "A1", "=MYGRID()"));

    // Anchor 持有原始 Array（WASM 投影口再塌成左上角标量），
    // 其余三格由既有 spill 投影出来 —— 与 `=SEQUENCE(2,2)` 同形。
    match wb.get_cell("Sheet1", "A1") {
        Value::Array(a) => assert_eq!(a.shape(), (2, 2)),
        other => panic!("anchor A1 应持有 Array，实得 {other:?}"),
    }
    assert_eq!(
        wb.sheet(0)
            .expect("sheet 0")
            .spill_info(einfach_excel_core::CellAddress::parse("A1").expect("A1")),
        Some((2, 2)),
        "自定义公式返回的数组必须注册成真正的 spill anchor"
    );
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(3.0));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(4.0));
}

#[test]
fn busy_token_roundtrip_and_custom_return_demotion() {
    // Import / set_error paths accept the token so pending cells round-trip…
    assert_eq!(error_token_to_value_error("#BUSY!"), Some(ValueError::Busy));
    assert_eq!(value_error_from_display("#BUSY!"), ValueError::Busy);
    // …but a custom-formula callback returning it demotes to #VALUE!
    // (returning #BUSY! would leave the cell permanently pending).
    assert_eq!(
        demote_busy_for_custom_return(ValueError::Busy),
        ValueError::InvalidValue
    );
    assert_eq!(
        demote_busy_for_custom_return(ValueError::Spill),
        ValueError::Spill
    );
}

#[test]
fn number_format_kind_aliases() {
    // "number" is the canonical TS name, accepted as input
    let json = NumberFormatJSON {
        kind: "number".into(),
        digits: Some(3),
        thousands: Some(true),
        symbol: None,
        pattern: None,
    };
    let nf = json.into_number_format();
    assert!(matches!(
        nf,
        NumberFormat::Decimal {
            digits: 3,
            thousands: true
        }
    ));

    // "percentage" is a documented TS synonym for "percent"
    let pct = NumberFormatJSON {
        kind: "percentage".into(),
        digits: Some(1),
        thousands: None,
        symbol: None,
        pattern: None,
    };
    let nf_pct = pct.into_number_format();
    assert!(matches!(nf_pct, NumberFormat::Percent { digits: 1 }));
}

#[test]
fn auto_fill_wire_requires_list_locale() {
    let payload = r#"{
            "sheet": 0,
            "sourceRange": {"startRow": 0, "startCol": 0, "endRow": 1, "endCol": 0},
            "targetRange": {"startRow": 0, "startCol": 0, "endRow": 3, "endCol": 0},
            "direction": "down",
            "series": "weekday-name",
            "list": {"listName": "weekday", "values": ["Mon", "Tue"]}
        }"#;

    let error = serde_json::from_str::<AutoFillRequestJSON>(payload)
        .expect_err("the native wire requires an explicit locale");
    assert!(error.to_string().contains("locale"));
}

#[test]
fn auto_fill_wire_preserves_canonical_locale_and_rejects_unknown_fields() {
    let payload = r#"{
            "sheet": 0,
            "sourceRange": {"startRow": 0, "startCol": 0, "endRow": 1, "endCol": 0},
            "targetRange": {"startRow": 0, "startCol": 0, "endRow": 3, "endCol": 0},
            "direction": "down",
            "series": "custom-list",
            "list": {
                "listName": "days",
                "values": ["Pazartesi", "Salı"],
                "locale": "tr-TR"
            }
        }"#;
    let request: AutoFillRequestJSON =
        serde_json::from_str(payload).expect("strict auto-fill payload");
    let core: AutoFillRequest = request.into();
    assert_eq!(
        core.list.as_ref().map(|list| list.locale.as_str()),
        Some("tr-TR")
    );

    let payload_with_unknown =
        payload.replacen("\"sheet\": 0,", "\"sheet\": 0, \"unexpected\": true,", 1);
    assert!(
        serde_json::from_str::<AutoFillRequestJSON>(&payload_with_unknown).is_err(),
        "unknown request fields must fail closed"
    );
}

#[test]
fn auto_fill_error_code_maps_too_large_to_its_own_wire_code_and_everything_else_generic() {
    // `AUTO_FILL_TOO_LARGE` lets hosts distinguish the size-budget
    // rejection from every other semantic rejection without parsing the
    // message text (parity with the `worker-workbook-backend.ts` /
    // `static-backend.ts` pre-flight checks, which reject the same
    // oversized request before ever reaching this wasm boundary).
    assert_eq!(
        auto_fill_error_code(&AutoFillError::TooLarge {
            requested_cells: 2_000_000
        }),
        AUTO_FILL_TOO_LARGE_ERROR_CODE
    );
    for other in [
        AutoFillError::SheetOutOfRange,
        AutoFillError::MutationDuringCustomCall,
        AutoFillError::InvalidGeometry("x"),
        AutoFillError::InvalidStep("x"),
        AutoFillError::InvalidSource("x"),
        AutoFillError::InvalidWitness("x"),
        AutoFillError::FormulaParse,
        AutoFillError::UnsupportedFormula,
        AutoFillError::UnsupportedSeries,
    ] {
        assert_eq!(auto_fill_error_code(&other), AUTO_FILL_REJECTION_ERROR_CODE);
    }
}

#[test]
fn apply_auto_fill_engine_call_rejects_a_request_over_the_cell_budget() {
    // Full end-to-end (minus the `JsValue` boundary, which needs a wasm32
    // runtime): a target range over `MAX_AUTO_FILL_CELLS` is rejected by
    // the engine itself, and the rejection maps to the too-large wire
    // code — the same path `apply_auto_fill` (the `#[wasm_bindgen]`
    // export) drives.
    let mut wb = Workbook::new();
    let request = AutoFillRequest {
        sheet_idx: 0,
        source_range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(0, 1)),
        target_range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(1_048_575, 1)),
        direction: AutoFillDirection::Down,
        series: AutoFillSeries::Copy,
        step: None,
        text_pattern: None,
        list: None,
    };
    let error = wb.apply_auto_fill(&request).unwrap_err();
    assert_eq!(
        error,
        AutoFillError::TooLarge {
            requested_cells: 2_097_152
        }
    );
    assert_eq!(auto_fill_error_code(&error), AUTO_FILL_TOO_LARGE_ERROR_CODE);
}

// === Excel Table registry wire (#32 T3) ===
//
// The `#[wasm_bindgen]`-exported CRUD methods touch `JsValue` in their
// signatures, so they can only be exercised through a JS runtime — the
// full create → formula → rename → delete round-trip lives in the WASM
// e2e (T8) and the engine round-trip in `excel-core/tests/table_shift.rs`.
// What is unit-testable natively is the wire mapping this crate owns:
// `TableJSON::from_entry` (range → A1 string, columns, flags, sheet
// index passthrough).
