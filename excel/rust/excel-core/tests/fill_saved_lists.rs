use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection as D, AutoFillListWitness, AutoFillNamedList, AutoFillNamedLists,
    AutoFillRequest, AutoFillSeries as S, CellAddress, CellRange, Workbook,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn list(name: &str, values: &[&str], locale: &str) -> AutoFillNamedList {
    AutoFillNamedList {
        series: S::CustomList,
        witness: AutoFillListWitness {
            list_name: name.into(),
            values: values.iter().map(|v| (*v).into()).collect(),
            locale: locale.into(),
        },
    }
}
fn parsed(value: &str) -> CellRange {
    let (a, b) = value.split_once(':').unwrap();
    range(a, b)
}
fn request(source: &str, target: &str, lists: Vec<AutoFillNamedList>) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: parsed(source),
        target_range: parsed(target),
        direction: D::Down,
        series: S::Copy,
        step: None,
        text_pattern: None,
        list: None,
        named_lists: AutoFillNamedLists::new(lists).unwrap(),
    }
}
fn put(wb: &mut Workbook, values: &[&str]) {
    for (i, value) in values.iter().enumerate() {
        wb.set_cell(0, &format!("A{}", i + 1), Value::Text((*value).into()));
    }
}
fn text(wb: &Workbook, address: &str, expected: &str) {
    assert_eq!(wb.get_cell("Sheet1", address), Value::Text(expected.into()));
}
fn priority() -> AutoFillNamedList {
    list("user:Priority", &["Low", "Medium", "High"], "en")
}

#[test]
fn partial_cycle_and_all_sample_order_choose_a_later_valid_candidate() {
    let mut wb = Workbook::new();
    put(&mut wb, &["medium", "High", "Low"]);
    let r = request(
        "A1:A3",
        "A1:A6",
        vec![
            list("host:Wrong", &["Low", "Medium", "Other", "High"], "en"),
            priority(),
        ],
    );
    let inferred = wb.infer_auto_fill_request(r).unwrap();
    assert_eq!(inferred.list.as_ref().unwrap().list_name, "user:Priority");
    wb.apply_auto_fill(&inferred).unwrap();
    text(&wb, "A1", "medium");
    text(&wb, "A4", "Medium");
    text(&wb, "A6", "Low");
}

#[test]
fn saved_numbered_text_precedes_text_number_but_builtins_keep_priority() {
    let mut wb = Workbook::new();
    put(&mut wb, &["Stage1", "Stage3"]);
    let r = request(
        "A1:A2",
        "A1:A4",
        vec![list("user:Stages", &["Stage1", "Stage3", "Stage9"], "en")],
    );
    wb.apply_inferred_auto_fill(&r).unwrap();
    text(&wb, "A3", "Stage9");
    text(&wb, "A4", "Stage1");
    put(&mut wb, &["Mon", "Tue"]);
    let r = request(
        "A1:A2",
        "A1:A4",
        vec![list("user:Days", &["Mon", "Tue", "Other"], "en")],
    );
    wb.apply_inferred_auto_fill(&r).unwrap();
    text(&wb, "A3", "Wed");
}

#[test]
fn single_reverse_skip_full_cycle_zero_step_and_whole_strings() {
    for (source, expected) in [
        (vec!["High"], "Low"),
        (vec!["High", "Medium"], "Low"),
        (vec!["Low", "High"], "Medium"),
        (vec!["Low", "Medium", "High", "Low"], "Medium"),
        (vec!["Low", "Low"], "Low"),
        (vec!["Low suffix"], "Low suffix"),
    ] {
        let mut wb = Workbook::new();
        put(&mut wb, &source);
        let n = source.len();
        wb.apply_inferred_auto_fill(&request(
            &format!("A1:A{n}"),
            &format!("A1:A{}", n + 1),
            vec![priority()],
        ))
        .unwrap();
        text(&wb, &format!("A{}", n + 1), expected);
    }
    for (direction, target, destination) in [
        (D::Up, "A1:A3", "A1"),
        (D::Left, "A3:C3", "A3"),
        (D::Right, "C3:E3", "E3"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "C3", Value::Text("High".into()));
        let source = if direction == D::Up { "A3:A3" } else { "C3:C3" };
        if direction == D::Up {
            wb.set_cell(0, "A3", Value::Text("High".into()));
        }
        let mut r = request(source, target, vec![priority()]);
        r.direction = direction;
        wb.apply_inferred_auto_fill(&r).unwrap();
        text(
            &wb,
            destination,
            if direction == D::Right {
                "Medium"
            } else {
                "Low"
            },
        );
    }
}

#[test]
fn turkic_and_sigma_folds_share_explicit_and_automatic_semantics() {
    for locale in ["tr", "az"] {
        for (source, values) in [
            ("I", vec!["ı", "Next"]),
            ("I\u{0307}", vec!["i", "Next"]),
            ("ΟΣ", vec!["ος", "Next"]),
        ] {
            let mut wb = Workbook::new();
            put(&mut wb, &[source]);
            wb.apply_inferred_auto_fill(&request(
                "A1:A1",
                "A1:A2",
                vec![list("user:Unicode", &values, locale)],
            ))
            .unwrap();
            text(&wb, "A2", "Next");
            text(&wb, "A1", source);
        }
    }
}

#[test]
fn number_sources_never_match_text_labels_and_invalid_matrix_lane_is_atomic() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "A1", Value::Number(1.0));
    wb.apply_inferred_auto_fill(&request(
        "A1:A1",
        "A1:A2",
        vec![list("user:Numbers", &["1", "2"], "en")],
    ))
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(1.0));
    put(&mut wb, &["Medium", "High"]);
    wb.set_formula(0, "B1", "=1e308");
    wb.set_formula(0, "B2", "=1e308*2");
    wb.set_cell(0, "A3", Value::Number(901.0));
    // Existing spill gate applies to the entire mixed-lane plan.
    wb.set_formula(0, "B3", "=SEQUENCE(2)");
    let r = request("A1:B2", "A1:B4", vec![priority()]);
    assert!(wb.apply_inferred_auto_fill(&r).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Number(901.0));
}

#[test]
fn mixed_saved_numeric_and_formula_lanes_have_one_history_and_untouched_neighbor() {
    use einfach_excel_core::workbook_history::WorkbookHistory;
    let mut wb = Workbook::new();
    put(&mut wb, &["Medium", "High"]);
    wb.set_cell(0, "B1", Value::Number(2.0));
    wb.set_cell(0, "B2", Value::Number(4.0));
    wb.set_formula(0, "C1", "=B1*2");
    wb.set_formula(0, "C2", "=B2*2");
    wb.set_cell(0, "D3", Value::Number(901.0));
    let mut history = WorkbookHistory::default();
    let r = request("A1:C2", "A1:C4", vec![priority()]);
    history
        .begin(&wb, 0, range("A3", "C4"), "Saved list matrix", true)
        .unwrap();
    history.apply_inferred_auto_fill(&mut wb, &r).unwrap();
    history.finish(&mut wb, true).unwrap();
    assert_eq!(history.undo_count(), 1);
    text(&wb, "A3", "Low");
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Number(8.0));
    assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Number(16.0));
    assert!(history.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Null);
    assert_eq!(history.undo_count(), 0);
    assert!(history.redo(&mut wb).unwrap());
    text(&wb, "A4", "Medium");
    assert_eq!(wb.get_cell("Sheet1", "D3"), Value::Number(901.0));
}
