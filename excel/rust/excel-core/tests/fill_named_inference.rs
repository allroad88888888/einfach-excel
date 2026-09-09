use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection, AutoFillListWitness, AutoFillRequest, AutoFillSeries, CellAddress,
    CellRange, Workbook,
};

fn range(a: &str, b: &str) -> CellRange {
    CellRange::new(
        CellAddress::parse(a).unwrap(),
        CellAddress::parse(b).unwrap(),
    )
}
fn request(series: AutoFillSeries, count: u32) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: range("C3", &format!("C{}", 2 + count)),
        target_range: range("C3", "C8"),
        direction: AutoFillDirection::Down,
        series,
        step: None,
        text_pattern: None,
        list: None,
    }
}
fn custom(values: &[&str]) -> AutoFillRequest {
    let mut r = request(AutoFillSeries::CustomList, 1);
    r.list = Some(AutoFillListWitness {
        list_name: "priority".into(),
        locale: "en".into(),
        values: values.iter().map(|v| (*v).into()).collect(),
    });
    r
}
fn apply(wb: &mut Workbook, r: AutoFillRequest) -> Result<AutoFillRequest, String> {
    let r = wb.infer_auto_fill_request(r).map_err(|e| e.to_string())?;
    wb.apply_auto_fill(&r).map_err(|e| e.to_string())?;
    Ok(r)
}

#[test]
fn automatic_english_and_chinese_weekdays_wrap_without_changing_source() {
    for (source, fourth) in [
        ("Friday", "Monday"),
        ("fri", "Mon"),
        ("星期五", "星期一"),
        ("周五", "周一"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "C3", Value::Text(source.into()));
        let r = apply(&mut wb, request(AutoFillSeries::Copy, 1)).unwrap();
        assert_eq!(r.series, AutoFillSeries::WeekdayName);
        assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Text(fourth.into()));
        assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Text(source.into()));
    }
}

#[test]
fn automatic_month_names_wrap_at_year_end() {
    for (source, next_year) in [
        ("November", "January"),
        ("NOV", "Jan"),
        ("11月", "1月"),
        ("十一月", "一月"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "C3", Value::Text(source.into()));
        let r = apply(&mut wb, request(AutoFillSeries::Copy, 1)).unwrap();
        assert_eq!(r.series, AutoFillSeries::MonthName);
        assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Text(next_year.into()));
    }
}

#[test]
fn sample_order_defines_skipping_and_reverse_cyclic_steps() {
    for (first, second, third, step) in [
        ("Mon", "Wed", "Fri", 2.0),
        ("Wed", "Tue", "Mon", 6.0),
        ("Fri", "Mon", "Thu", 3.0),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "C3", Value::Text(first.into()));
        wb.set_cell(0, "C4", Value::Text(second.into()));
        let r = apply(&mut wb, request(AutoFillSeries::WeekdayName, 2)).unwrap();
        assert_eq!(r.step, Some(step));
        assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Text(third.into()));
    }
}

#[test]
fn reverse_geometry_uses_the_same_native_named_plan() {
    for (direction, target, destination) in [
        (AutoFillDirection::Up, range("C1", "C3"), "C1"),
        (AutoFillDirection::Left, range("A3", "C3"), "A3"),
        (AutoFillDirection::Right, range("C3", "E3"), "E3"),
    ] {
        let mut wb = Workbook::new();
        wb.set_cell(0, "C3", Value::Text("Jan".into()));
        let mut r = request(AutoFillSeries::MonthName, 1);
        r.target_range = target;
        r.direction = direction;
        apply(&mut wb, r).unwrap();
        assert_eq!(
            wb.get_cell("Sheet1", destination),
            Value::Text(
                if direction == AutoFillDirection::Right {
                    "Mar"
                } else {
                    "Nov"
                }
                .into()
            )
        );
    }
}

#[test]
fn custom_list_follows_explicit_order_and_preserves_source_case() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "C3", Value::Text("medium".into()));
    apply(&mut wb, custom(&["Low", "Medium", "High"])).unwrap();
    assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Text("High".into()));
    assert_eq!(wb.get_cell("Sheet1", "C5"), Value::Text("Low".into()));
    assert_eq!(wb.get_cell("Sheet1", "C3"), Value::Text("medium".into()));
}

#[test]
fn invalid_lists_sources_and_steps_never_overwrite_targets() {
    let mut wb = Workbook::new();
    wb.set_cell(0, "C3", Value::Text("Low".into()));
    wb.set_cell(0, "C4", Value::Number(99.0));
    for values in [
        vec!["Low"],
        vec!["Low", "low"],
        vec!["Low", " "],
        vec!["High", "Medium"],
    ] {
        assert!(apply(&mut wb, custom(&values)).is_err());
        assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Number(99.0));
    }
    let long = "x".repeat(16384);
    assert!(apply(&mut wb, custom(&["Low", &long])).is_err());
    assert!(wb.set_formula(0, "C3", "=\"Low\""));
    assert!(apply(&mut wb, custom(&["Low", "High"])).is_err());
    assert_eq!(wb.get_cell("Sheet1", "C4"), Value::Number(99.0));
}

#[test]
fn irregular_named_samples_copy_automatically_but_explicit_series_rejects() {
    let mut wb = Workbook::new();
    for (addr, value) in [("C3", "Mon"), ("C4", "Wed"), ("C5", "Thu")] {
        wb.set_cell(0, addr, Value::Text(value.into()));
    }
    assert!(apply(&mut wb, request(AutoFillSeries::WeekdayName, 3)).is_err());
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Null);
    assert_eq!(
        apply(&mut wb, request(AutoFillSeries::Copy, 3))
            .unwrap()
            .series,
        AutoFillSeries::Copy
    );
    assert_eq!(wb.get_cell("Sheet1", "C6"), Value::Text("Mon".into()));
}
