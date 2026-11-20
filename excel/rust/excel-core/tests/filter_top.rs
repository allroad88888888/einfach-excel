use einfach_core::Value;
use einfach_excel_core::{CellAddress, CellRange, ColumnFilterRule, Workbook};
use einfach_excel_core::advanced_filter::ColumnFilterGroup;
use einfach_excel_core::filter::{FilterTopAmount, FilterTopDirection};

fn range() -> CellRange {
    CellRange::new(CellAddress::new(0, 0), CellAddress::new(9, 1))
}
fn top(direction: FilterTopDirection, amount: FilterTopAmount) -> ColumnFilterRule {
    ColumnFilterRule::Top { col_index: 1, direction, amount }
}
fn seed() -> Workbook {
    let mut book = Workbook::new();
    book.set_cell(0, "A1", Value::Text("Group".into()));
    book.set_cell(0, "B1", Value::Number(99999.));
    for row in 2..=10 {
        book.set_cell(0, &format!("A{row}"), Value::Text(if row == 2 { "No" } else { "Yes" }.into()));
    }
    for (address, value) in [("B2", 100.), ("B3", 90.), ("B4", 90.), ("B5", 80.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    book.set_cell(0, "B6", Value::Text("999".into()));
    book.set_formula(0, "B8", "=1/0");
    book.set_formula(0, "B9", "=70");
    book.set_cell(0, "B10", Value::Boolean(true));
    book
}

#[test]
fn all_scopes_rank_typed_values_before_other_conditions_and_keep_ties() {
    for scope in 0..3 {
        let mut book = seed();
        let rules = [top(FilterTopDirection::Top, FilterTopAmount::Items(2)),
            ColumnFilterRule::Equals { col_index: 0, value: "Yes".into(), case_sensitive: false }];
        let report = match scope {
            0 => book.apply_filter(0, &rules).unwrap(),
            1 => book.apply_filter_range(0, range(), &rules).unwrap(),
            _ => {
                book.define_table(Some("Scores"), 0, range(), true).unwrap();
                book.set_table_totals_row("Scores", true).unwrap();
                book.set_cell(0, "B11", Value::Number(100000.));
                book.apply_table_filter("Scores", &rules).unwrap()
            }
        };
        assert_eq!(report.hidden_rows, vec![1, 4, 5, 6, 7, 8, 9], "scope {scope}");
        assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(100.));
    }
}

#[test]
fn percent_rounds_up_numeric_population_and_bottom_includes_formulas() {
    let mut book = Workbook::new();
    for (address, value) in [("A2", -2.), ("A3", 0.), ("A4", 0.)] {
        book.set_cell(0, address, Value::Number(value));
    }
    book.set_cell(0, "A5", Value::Text("100".into()));
    book.set_formula(0, "A6", "=\"\"");
    let area = CellRange::new(CellAddress::new(0, 0), CellAddress::new(5, 0));
    let rule = |direction, amount| ColumnFilterRule::Top { col_index: 0, direction, amount };
    assert_eq!(book.apply_filter_range(0, area, &[rule(FilterTopDirection::Bottom,
        FilterTopAmount::Percent(50))]).unwrap().hidden_rows, vec![4, 5]);
    assert_eq!(book.apply_filter_range(0, area, &[rule(FilterTopDirection::Top,
        FilterTopAmount::Percent(1))]).unwrap().hidden_rows, vec![1, 4, 5]);
    assert_eq!(book.apply_filter_range(0, area, &[rule(FilterTopDirection::Top,
        FilterTopAmount::Percent(100))]).unwrap().hidden_rows, vec![4, 5]);
    book.set_formula(0, "A2", "=-3");
    assert_eq!(book.apply_filter_range(0, area, &[rule(FilterTopDirection::Bottom,
        FilterTopAmount::Items(1))]).unwrap().hidden_rows, vec![2, 3, 4, 5]);
}

#[test]
fn grouped_same_column_ranks_have_independent_cutoffs() {
    let mut book = seed();
    let groups = [ColumnFilterGroup { rules: vec![top(FilterTopDirection::Top,
        FilterTopAmount::Items(1))] }, ColumnFilterGroup { rules: vec![
        top(FilterTopDirection::Top, FilterTopAmount::Items(3)),
        ColumnFilterRule::Equals { col_index: 0, value: "Yes".into(), case_sensitive: false }] }];
    assert_eq!(book.apply_filter_range_groups(0, range(), &groups).unwrap().hidden_rows,
        vec![4, 5, 6, 7, 8, 9]);
    let reversed: Vec<_> = groups.into_iter().rev().collect();
    assert_eq!(book.apply_filter_range_groups(0, range(), &reversed).unwrap().hidden_rows,
        vec![4, 5, 6, 7, 8, 9]);
}

#[test]
fn legacy_summary_is_excluded_from_population_but_explicit_range_keeps_it() {
    let mut book = seed();
    book.set_cell(0, "A10", Value::Text("Total".into()));
    book.set_cell(0, "B10", Value::Number(10000.));
    let rules = [top(FilterTopDirection::Top, FilterTopAmount::Items(1))];
    assert_eq!(book.apply_filter(0, &rules).unwrap().hidden_rows, (2..=8).collect::<Vec<_>>());
    assert_eq!(book.apply_filter_range(0, range(), &rules).unwrap().hidden_rows,
        (1..=8).collect::<Vec<_>>());
}

#[test]
fn spill_anchor_is_a_scalar_candidate_and_nonfinite_or_empty_population_never_matches() {
    let mut book = Workbook::new();
    book.set_formula(0, "B2", "=SEQUENCE(3,1,10,10)");
    let rules = [top(FilterTopDirection::Bottom, FilterTopAmount::Items(1))];
    let area = CellRange::new(CellAddress::new(0, 0), CellAddress::new(3, 1));
    assert_eq!(book.apply_filter_range(0, area, &rules).unwrap().hidden_rows, vec![2, 3]);
    let mut book = Workbook::new();
    book.set_cell(0, "B2", Value::Number(f64::INFINITY));
    book.set_cell(0, "B3", Value::Text("12".into()));
    assert_eq!(book.apply_filter_range(0, area, &rules).unwrap().hidden_rows, vec![1, 2, 3]);
}
