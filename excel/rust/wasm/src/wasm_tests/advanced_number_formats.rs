#[test]
fn advanced_formats_wire_roundtrip_preserves_native_options() {
    for (wire, value, expected) in [
        (serde_json::json!({"kind":"number","digits":0}), 2.5, "3"),
        (serde_json::json!({"kind":"percent","digits":0}), 0.025, "3%"),
        (serde_json::json!({"kind":"currency","digits":2,"symbol":"€"}), -1234.125, "€-1,234.13"),
        (serde_json::json!({"kind":"text"}), 12345.0, "12345"),
        (
            serde_json::json!({"kind":"scientific","digits":3}),
            12345.0,
            "1.235E+04",
        ),
        (
            serde_json::json!({"kind":"fraction","denominator":"two-digit"}),
            0.05,
            "1/20",
        ),
        (
            serde_json::json!({"kind":"fraction","denominator":16}),
            0.5,
            "8/16",
        ),
        (
            serde_json::json!({"kind":"time","pattern":"h:mm AM/PM"}),
            0.5,
            "12:00 PM",
        ),
    ] {
        let native = serde_json::from_value::<NumberFormatJSON>(wire.clone())
            .unwrap()
            .into_number_format();
        let encoded = serde_json::to_value(NumberFormatJSON::from_number_format(&native)).unwrap();
        for (key, expected) in wire.as_object().unwrap() {
            assert_eq!(&encoded[key], expected);
        }
        let restored = serde_json::from_value::<NumberFormatJSON>(encoded)
            .unwrap()
            .into_number_format();
        assert_eq!(native, restored);
        assert!(uses_native_number_display(&native));
        let format = CellFormat {
            number_format: restored,
            ..Default::default()
        };
        assert_eq!(format.format_number(value), expected);
    }
}

#[test]
fn advanced_format_defaults_are_native_and_invalid_denominators_reject_before_mutation() {
    for (kind, value, expected) in [
        ("scientific", 123.0, "1.23E+02"),
        ("fraction", 0.5, "1/2"),
        ("time", 0.5, "12:00:00"),
    ] {
        let format: NumberFormatJSON =
            serde_json::from_value(serde_json::json!({"kind":kind})).unwrap();
        assert_eq!(
            CellFormat {
                number_format: format.into_number_format(),
                ..Default::default()
            }
            .format_number(value),
            expected
        );
    }
    for denominator in [
        serde_json::json!(0),
        serde_json::json!(-1),
        serde_json::json!(1.5),
        serde_json::json!(4294967296_u64),
        serde_json::json!("unknown"),
    ] {
        assert!(serde_json::from_value::<CellFormatJSON>(serde_json::json!({
            "numberFormat":{"kind":"fraction","denominator":denominator}
        }))
        .is_err());
    }
}

#[test]
fn advanced_formats_survive_workbook_persistence_without_converting_values() {
    let mut source = WasmWorkbook::new();
    let cases = [
        (serde_json::json!({"kind":"number","digits":0}), 2.5, "3"),
        (serde_json::json!({"kind":"percent","digits":0}), 0.025, "3%"),
        (serde_json::json!({"kind":"currency","digits":2,"symbol":"€"}), -1234.125, "€-1,234.13"),
        (serde_json::json!({"kind":"text"}), 12345.0, "12345"),
        (
            serde_json::json!({"kind":"scientific","digits":3}),
            12345.0,
            "1.235E+04",
        ),
        (
            serde_json::json!({"kind":"fraction","denominator":"two-digit"}),
            0.05,
            "1/20",
        ),
        (
            serde_json::json!({"kind":"fraction","denominator":8}),
            0.5,
            "4/8",
        ),
        (
            serde_json::json!({"kind":"time","pattern":"[h]:mm:ss"}),
            1.5,
            "36:00:00",
        ),
    ];
    for (i, (wire, value, _)) in cases.iter().enumerate() {
        let addr = format!("A{}", i + 1);
        source.set_number(0, &addr, *value);
        source.workbook.sheet_mut(0).unwrap().set_format(
            &addr,
            CellFormat {
                number_format: serde_json::from_value::<NumberFormatJSON>(wire.clone())
                    .unwrap()
                    .into_number_format(),
                italic: true,
                ..Default::default()
            },
        );
    }
    let serialized = serde_json::to_string(&source.snapshot_persistence_v1_json()).unwrap();
    let mut restored = WasmWorkbook::new();
    restored
        .restore_persistence_v1_json(serde_json::from_str(&serialized).unwrap())
        .unwrap();
    for (i, (_, value, expected)) in cases.iter().enumerate() {
        let addr = format!("A{}", i + 1);
        assert_eq!(restored.get_number(0, &addr), *value);
        assert_eq!(
            native_number_display(&restored.workbook, 0, &addr, &Value::Number(*value)),
            Some(expected.to_string())
        );
        assert!(restored.workbook.sheet(0).unwrap().get_format(&addr).italic);
    }
}
