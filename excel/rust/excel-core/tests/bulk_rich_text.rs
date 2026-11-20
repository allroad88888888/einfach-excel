use einfach_core::Value;
use einfach_excel_core::{CellAddress, FontBaseline, Workbook};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};

fn addr(value: &str) -> CellAddress { CellAddress::parse(value).unwrap() }
fn runs() -> Vec<RichTextRun> {
    vec![RichTextRun { text: "x".into(), format: RichTextFormat::default() },
        RichTextRun { text: "2".into(), format: RichTextFormat {
            font_baseline: Some(FontBaseline::Superscript), color: Some("#ff0000".into()),
            ..Default::default()
        } }]
}

#[test]
fn bulk_inline_writes_obey_the_same_order_as_primitives_formulas_and_clear() {
    let mut book = Workbook::new();
    book.bulk_load(|loader| {
        for cell in ["A1", "B1", "C1", "D1", "E1"] {
            loader.set_text_runs_at(0, addr(cell), "x2".into(), runs()).unwrap();
        }
        loader.set_cell_at(0, addr("A1"), Value::Text("x2!".into()));
        loader.set_cell_at(0, addr("B1"), Value::Number(7.));
        loader.set_formula_at(0, addr("C1"), "=1+2");
        assert!(!loader.set_formula_at(0, addr("D1"), "=)"));
        loader.clear_cell_at(0, addr("E1"));
        loader.set_cell_at(0, addr("F1"), Value::Number(4.));
        loader.set_text_runs_at(0, addr("F1"), "x2".into(), runs()).unwrap();
    });
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("x2!".into()));
    let rebased = book.sheet(0).unwrap().rich_text(addr("A1")).unwrap();
    assert_eq!(rebased.iter().map(|run| run.text.as_str()).collect::<String>(), "x2!");
    assert_eq!(rebased[1].format.font_baseline, Some(FontBaseline::Superscript));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Number(7.));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Number(3.));
    assert!(matches!(book.get_cell("Sheet1", "D1"), Value::Error(_)));
    assert_eq!(book.get_cell("Sheet1", "E1"), Value::Null);
    for cell in ["B1", "C1", "D1", "E1"] {
        assert!(book.sheet(0).unwrap().rich_text(addr(cell)).is_none());
    }
    assert_eq!(book.get_cell("Sheet1", "F1"), Value::Text("x2".into()));
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("F1")).unwrap()[1].format.color.as_deref(), Some("#FF0000"));
}

#[test]
fn invalid_inline_write_cannot_replace_an_already_queued_literal() {
    let mut book = Workbook::new();
    book.bulk_load(|loader| {
        loader.set_text_runs_at(0, addr("A1"), "x2".into(), runs()).unwrap();
        assert!(loader.set_text_runs_at(0, addr("A1"), "wrong".into(), runs()).is_err());
        let mut invalid = runs(); invalid[1].format.font_size = Some(0.);
        assert!(loader.set_text_runs_at(0, addr("A1"), "x2".into(), invalid).is_err());
        assert!(loader.set_text_runs_at(9, addr("A1"), "x2".into(), runs()).is_err());
        assert!(loader.set_text_runs_at(0, CellAddress::new(1_048_576, 0), "x2".into(), runs()).is_err());
    });
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("x2".into()));
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A1")).unwrap()[1].format.font_baseline,
        Some(FontBaseline::Superscript));
}

#[test]
fn bulk_rich_literal_withdraws_a_spill_child_before_installing_runs() {
    let mut book = Workbook::new();
    book.set_formula(0, "A1", "=SEQUENCE(2)");
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Number(2.));
    book.bulk_load(|loader| {
        loader.set_text_runs_at(0, addr("A2"), "x2".into(), runs()).unwrap();
    });
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("x2".into()));
    assert!(matches!(book.get_cell("Sheet1", "A1"), Value::Error(_)));
    assert_eq!(book.sheet(0).unwrap().rich_text(addr("A2")).unwrap()[1].format.font_baseline,
        Some(FontBaseline::Superscript));
}
