#[cfg(test)]
mod font_baseline_wire_tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn sparse_normal_is_distinct_from_absence_in_every_wire_direction() {
        for value in ["normal", "superscript", "subscript"] {
            let wire: CellFormatJSON = serde_json::from_value(json!({ "fontBaseline": value })).unwrap();
            let style = wire.into_style();
            assert!(style.font_baseline.is_some());
            let restored = serde_json::to_value(CellFormatJSON::from_style(&style)).unwrap();
            assert_eq!(restored["fontBaseline"], value);
        }
        let wire: CellFormatJSON = serde_json::from_value(json!({})).unwrap();
        assert_eq!(wire.into_style().font_baseline, None);
        let normal = serde_json::to_value(CellFormatJSON::from_format(&CellFormat::default())).unwrap();
        assert!(normal.get("fontBaseline").is_none());
        for value in [json!("invalid"), json!(true), json!(4)] {
            assert!(serde_json::from_value::<CellFormatJSON>(json!({"fontBaseline":value})).is_err());
        }
    }

    #[test]
    fn native_rich_run_normal_survives_while_omitted_baseline_stays_inherited() {
        use einfach_excel_core::rich_text::RichTextRun;
        let runs: Vec<RichTextRun> = serde_json::from_value(json!([
            { "text": "H", "format": {} },
            { "text": "2", "format": { "fontBaseline": "normal" } }
        ])).unwrap();
        let restored = serde_json::to_value(runs).unwrap();
        assert!(restored[0]["format"].get("fontBaseline").is_none());
        assert_eq!(restored[1]["format"]["fontBaseline"], "normal");
        assert!(serde_json::from_value::<RichTextRun>(json!({
            "text":"X", "format":{"fontBaseline":"super"}
        })).is_err());
    }
}
