use einfach_core::Value;
use einfach_excel_core::{CellAddress, Workbook};
use std::{cell::Cell, collections::HashMap, rc::Rc};

fn installed(n: u32) -> Workbook {
    let mut wb = Workbook::new();
    let values = (0..n)
        .map(|r| (CellAddress::new(r, 0), Value::Number(1.)))
        .collect();
    wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
        .unwrap();
    wb
}
fn sum(wb: &Workbook) -> f64 {
    wb.get_cell("Sheet1", "B1").as_number().unwrap()
}
#[test]
fn large_plain_range_keeps_one_epoch_per_member_and_releases_them() {
    let mut wb = installed(1000);
    wb.set_formula(0, "B1", "=SUM(A1:A1000)");
    assert_eq!(sum(&wb), 1000.);
    assert!(wb.debug_total_atom_count(0) <= 1010);
    wb.set_cell(0, "B1", Value::Number(0.));
    assert!(
        wb.debug_total_atom_count(0) <= 2,
        "range epochs must be reclaimed"
    );
}
#[test]
fn member_identity_changes_keep_dependencies_current() {
    let mut wb = installed(1000);
    wb.set_formula(0, "B1", "=SUM(A1:A1000)");
    assert_eq!(sum(&wb), 1000.);
    // Public atom promotion must rebind a reader before a later same-id edit.
    wb.sheet_mut(0).unwrap().cell_atom("A1");
    wb.set_cell(0, "A1", Value::Number(2.));
    assert_eq!(sum(&wb), 1001.);
    wb.set_formula(0, "A1", "=C1+3");
    assert_eq!(sum(&wb), 1002.);
    wb.set_cell(0, "C1", Value::Number(4.));
    assert_eq!(sum(&wb), 1006.);
    wb.set_cell(0, "A1", Value::Null);
    assert_eq!(sum(&wb), 999.);
    wb.set_cell(0, "A1", Value::Number(5.));
    assert_eq!(sum(&wb), 1004.);
    wb.bulk_load(|loader| loader.set_cell(0, "A2", Value::Number(7.)));
    assert_eq!(sum(&wb), 1010.);
}
#[test]
fn subscriptions_and_cross_sheet_replacement_stay_live() {
    let mut wb = installed(1000);
    let other = wb.add_sheet("Other");
    wb.set_formula(other, "A1", "=SUM(Sheet1!A1:A1000)");
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(1000.));
    let calls = Rc::new(Cell::new(0));
    let c = calls.clone();
    let sub = wb
        .sheet_mut(other)
        .unwrap()
        .subscribe_cell("A1", move || c.set(c.get() + 1));
    wb.set_cell(0, "A1", Value::Number(2.));
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(1001.));
    assert_eq!(calls.get(), 1);
    let values = HashMap::from([(CellAddress::new(0, 0), Value::Number(9.))]);
    wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
        .unwrap();
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(9.));
    wb.set_cell(0, "A1", Value::Number(10.));
    assert_eq!(wb.get_cell("Other", "A1"), Value::Number(10.));
    wb.sheet_mut(other).unwrap().unsubscribe_cell(sub);
}
#[test]
fn mixed_spills_and_plain_members_recompute() {
    let mut wb = installed(1000);
    wb.set_formula(0, "A1001", "=SEQUENCE(3,1,C1+1)");
    wb.set_formula(0, "B1", "=SUM(A1:A1200)");
    assert_eq!(sum(&wb), 1006.);
    wb.set_cell(0, "C1", Value::Number(3.));
    assert_eq!(sum(&wb), 1015.);
    wb.set_cell(0, "A1002", Value::Number(10.));
    assert!(wb.get_cell("Sheet1", "B1").is_error());
}

#[test]
fn large_range_respects_manual_calculation_and_cycle_recovery() {
    use einfach_excel_core::CalculationMode;
    let mut wb = installed(1000);
    wb.set_formula(0, "B1", "=SUM(A1:A1000)");
    assert_eq!(sum(&wb), 1000.);
    wb.set_calculation_mode(CalculationMode::Manual);
    wb.set_cell(0, "A1", Value::Number(5.));
    assert_eq!(sum(&wb), 1000.);
    wb.recalculate(None).unwrap();
    assert_eq!(sum(&wb), 1004.);
    wb.set_calculation_mode(CalculationMode::Automatic);
    wb.set_formula(0, "A1", "=B1");
    assert!(wb.get_cell("Sheet1", "B1").is_error());
    wb.set_cell(0, "A1", Value::Number(2.));
    assert_eq!(sum(&wb), 1001.);
}

#[test]
fn sparse_windows_ignore_empty_area_and_preserve_mixed_values() {
    use einfach_excel_core::CellRange;
    let mut wb = installed(1000);
    wb.set_formula(0, "B7", "=A1*3");
    wb.set_cell(0, "A2", Value::Text("shared".into()));
    let read = |last_col| {
        let mut out = Vec::new();
        wb.for_each_sparse_range_cell(
            0,
            CellRange::new(CellAddress::new(0, 0), CellAddress::new(9, last_col)),
            |addr, value| out.push((addr, value)),
        );
        out
    };
    let bounded = read(2);
    let large = read(499);
    assert_eq!(bounded.len(), 11);
    assert_eq!(bounded, large);
    assert_eq!(bounded[7], (CellAddress::new(6, 1), Value::Number(3.)));
}

#[test]
fn wide_dense_and_sparse_windows_preserve_all_five_thousand_values() {
    use einfach_excel_core::CellRange;
    let mut wb = Workbook::new();
    let values = (0..5000)
        .map(|i| {
            (
                CellAddress::new(i / 50, i % 50),
                Value::Text(format!("cell-{i}").into()),
            )
        })
        .collect();
    wb.install_workbook_bulk(vec![(0, values, HashMap::new())])
        .unwrap();
    wb.set_cell(0, "A2", Value::Number(42.));
    wb.set_formula(0, "B2", "=A2+1");
    for last_row in [99, 999_999] {
        let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(last_row, 49));
        let mut count = 0;
        wb.for_each_sparse_range_cell(0, range, |addr, value| {
            assert_eq!(addr, CellAddress::new(count / 50, count % 50));
            match count {
                50 => assert_eq!(value, Value::Number(42.)),
                51 => assert_eq!(value, Value::Number(43.)),
                _ => assert_eq!(value.as_text(), Some(format!("cell-{count}").as_str())),
            }
            count += 1;
        });
        assert_eq!(count, 5000);
    }
}

#[test]
fn exports_preserve_order_and_lazy_formulas_across_the_snapshot_budget() {
    use einfach_excel_core::CellRange;
    let mut wb = Workbook::new();
    let values = (0..10_000)
        .map(|row| (CellAddress::new(row, 0), Value::Number(1.)))
        .collect();
    let formulas = HashMap::from([
        (CellAddress::new(8191, 1), "=A8192+1".to_owned()),
        (CellAddress::new(8192, 1), "=A8193+2".to_owned()),
    ]);
    wb.install_workbook_bulk(vec![(0, values, formulas)])
        .unwrap();
    wb.set_cell(0, "A8191", Value::Text("shared".into()));
    for rows in [8191, 8192, 8193, 10_000] {
        let range = CellRange::new(CellAddress::new(0, 0), CellAddress::new(rows - 1, 1));
        let mut previous = None;
        let mut count = 0;
        wb.for_each_sparse_range_cell(0, range, |addr, value| {
            let key = (addr.row, addr.col);
            assert!(previous.is_none_or(|p| p < key));
            previous = Some(key);
            match key {
                (8190, 0) => assert_eq!(value.as_text(), Some("shared")),
                (8191, 1) => assert_eq!(value, Value::Number(2.)),
                (8192, 1) => assert_eq!(value, Value::Number(3.)),
                _ => assert_eq!(value, Value::Number(1.)),
            }
            count += 1;
        });
        assert_eq!(
            count,
            rows + u32::from(rows >= 8192) + u32::from(rows >= 8193)
        );
    }
}
