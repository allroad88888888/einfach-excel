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
fn text(wb: &Workbook, address: &str, expected: &str) {
    assert_eq!(wb.get_cell("Sheet1", address), Value::Text(expected.into()));
}
fn priority() -> AutoFillNamedList {
    list("user:Priority", &["Low", "Medium", "High"], "en")
}

#[test]
fn catalog_bounds_reject_protocol_spoofs_and_utf16_overflow() {
    for candidate in [
        list("user:builtin-weekday-short", &["Low", "High"], "en"),
        list("user:Bad", &["I", "ı"], "tr"),
        list("user:Empty", &["Low", " "], "en"),
        list("host:Long", &[&"😀".repeat(8192), "x"], "en"),
    ] {
        assert!(AutoFillNamedLists::new(vec![candidate]).is_err());
    }
    let mut forged = priority();
    forged.series = S::WeekdayName;
    forged.witness.list_name = "builtin-weekday-short".into();
    assert!(AutoFillNamedLists::new(vec![forged]).is_err());
    assert!(AutoFillNamedLists::new(
        (0..33)
            .map(|i| list(&format!("user:L{i}"), &["Low", "High"], "en"))
            .collect()
    )
    .is_err());
    assert!(AutoFillNamedLists::new(vec![priority(), priority()]).is_err());
}

#[test]
fn maximum_catalog_is_prepared_once_and_real_matrix_fill_is_correct() {
    let started = std::time::Instant::now();
    let mut candidates = Vec::new();
    for i in 0..66 {
        let mut values: Vec<String> = (0..512)
            .map(|v| format!("L{i:02} item{v:03} {:0<20}", ""))
            .collect();
        assert!(values
            .iter()
            .all(|value| value.encode_utf16().count() == 32));
        let series = if i == 0 {
            S::WeekdayName
        } else if i == 1 {
            S::MonthName
        } else {
            S::CustomList
        };
        let name = if i == 0 {
            "locale-weekday".into()
        } else if i == 1 {
            "locale-month".into()
        } else {
            format!("{}:{i:064}", if i < 34 { "host" } else { "user" })
        };
        if i == 65 {
            values[0] = format!("{:0<32}", "Medium");
            values[1] = format!("{:0<32}", "High");
        }
        candidates.push(AutoFillNamedList {
            series,
            witness: AutoFillListWitness {
                list_name: name,
                values,
                locale: "en-Latn-US".into(),
            },
        });
    }
    let first = candidates[65].witness.values[0].clone();
    let expected = candidates[65].witness.values[1].clone();
    let catalog = AutoFillNamedLists::new(candidates).unwrap();
    let prepared_ms = started.elapsed().as_millis();
    let mut wb = Workbook::new();
    for col in 0..192 {
        wb.set_cell(
            0,
            &CellAddress::new(0, col).to_string(),
            Value::Text(first.clone().into()),
        );
    }
    let mut r = request("A1:A1", "A1:A3", vec![]);
    r.source_range = range("A1", &CellAddress::new(0, 191).to_string());
    r.target_range = range("A1", &CellAddress::new(2, 191).to_string());
    r.named_lists = catalog;
    let fill_started = std::time::Instant::now();
    wb.apply_inferred_auto_fill(&r).unwrap();
    for col in 0..192 {
        text(&wb, &CellAddress::new(1, col).to_string(), &expected);
    }
    eprintln!(
        "66 × 16384 UTF-16 catalog prepared in {prepared_ms}ms; 192-lane actual fill in {}ms",
        fill_started.elapsed().as_millis()
    );
}
