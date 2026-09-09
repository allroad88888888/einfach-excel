use einfach_core::Value;
use einfach_excel_core::{
    AutoFillDirection, AutoFillRequest, AutoFillSeries, CellAddress, CellRange, Workbook,
};

fn request(series: AutoFillSeries, samples: u32) -> AutoFillRequest {
    AutoFillRequest {
        sheet_idx: 0,
        source_range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(samples - 1, 0)),
        target_range: CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 0)),
        direction: AutoFillDirection::Down,
        series,
        step: None,
        text_pattern: None,
        list: None,
    }
}

#[test]
fn date_input_and_automatic_fill_infer_days_weeks_and_month_ends() {
    for (samples, expected, kind) in [
        (vec!["2024-02-28"], "2024-03-02", AutoFillSeries::DateDay),
        (
            vec!["2024-01-01", "2024-01-08"],
            "2024-01-22",
            AutoFillSeries::DateWeek,
        ),
        (
            vec!["2024-01-31", "2024-02-29"],
            "2024-04-30",
            AutoFillSeries::DateMonth,
        ),
        (
            vec!["2024-03-31", "2024-02-29"],
            "2023-12-31",
            AutoFillSeries::DateMonth,
        ),
    ] {
        let mut wb = Workbook::new();
        for (i, sample) in samples.iter().enumerate() {
            wb.set_cell_input(0, &format!("A{}", i + 1), sample)
                .unwrap();
        }
        let r = wb
            .infer_auto_fill_request(request(AutoFillSeries::Copy, samples.len() as u32))
            .unwrap();
        assert_eq!(r.series, kind);
        wb.apply_auto_fill(&r).unwrap();
        assert_eq!(wb.sheet(0).unwrap().formatted_display("A4"), expected);
    }
}

#[test]
fn irregular_and_overflow_dates_never_silently_become_numeric_progressions() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A1", "9999-12-31").unwrap();
    wb.set_cell(0, "A2", Value::Number(42.0));
    let r = wb
        .infer_auto_fill_request(request(AutoFillSeries::Copy, 1))
        .unwrap();
    assert_eq!(r.series, AutoFillSeries::DateDay);
    assert!(wb.apply_auto_fill(&r).is_err());
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Number(42.0));
    for (i, day) in [1, 3, 4].iter().enumerate() {
        wb.set_cell_input(0, &format!("A{}", i + 1), &format!("2024-01-{day:02}"))
            .unwrap();
    }
    assert!(wb
        .infer_auto_fill_request(request(AutoFillSeries::DateDay, 3))
        .is_err());
    assert_eq!(
        wb.infer_auto_fill_request(request(AutoFillSeries::Copy, 3))
            .unwrap()
            .series,
        AutoFillSeries::Copy
    );
}

#[test]
fn reverse_drag_crosses_the_compatibility_day_with_the_same_native_plan() {
    let mut wb = Workbook::new();
    wb.set_cell_input(0, "A4", "1900-03-01").unwrap();
    let mut r = request(AutoFillSeries::Copy, 1);
    r.source_range = CellRange::single(CellAddress::new(3, 0));
    r.direction = AutoFillDirection::Up;
    let r = wb.infer_auto_fill_request(r).unwrap();
    wb.apply_auto_fill(&r).unwrap();
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A3"), "1900-02-29");
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A2"), "1900-02-28");
    assert_eq!(wb.sheet(0).unwrap().formatted_display("A1"), "1900-02-27");
}
