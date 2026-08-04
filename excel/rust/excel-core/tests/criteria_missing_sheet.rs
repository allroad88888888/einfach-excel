//! Missing-sheet propagation for conditional aggregate range arguments.

use einfach_core::{Value, ValueError};
use einfach_excel_core::Workbook;

#[test]
fn conditional_aggregates_do_not_turn_missing_sheet_ranges_into_empty_sets() {
    let mut wb = Workbook::new();
    let source = wb.add_sheet("Source");
    wb.sheet_mut(source)
        .unwrap()
        .set_cell("A1", Value::Number(1.0));
    wb.sheet_mut(source)
        .unwrap()
        .set_cell("B1", Value::Number(10.0));

    let formulas = [
        "=COUNTIF(Missing!A:A,\">0\")",
        "=SUMIF(Missing!A:A,\">0\",Source!B:B)",
        "=SUMIF(Source!A:A,\">0\",Missing!B:B)",
        "=AVERAGEIF(Missing!A:A,\">0\",Source!B:B)",
        "=AVERAGEIF(Source!A:A,\">0\",Missing!B:B)",
        "=COUNTIFS(Source!A:A,\">0\",Missing!B:B,\">0\")",
        "=SUMIFS(Missing!A:A,Source!A:A,\">0\")",
        "=AVERAGEIFS(Source!B:B,Missing!A:A,\">0\")",
        "=MAXIFS(Source!B:B,Missing!A:A,\">0\")",
        "=MINIFS(Missing!B:B,Source!A:A,\">0\")",
    ];
    for (row, formula) in formulas.iter().enumerate() {
        wb.set_formula(0, &format!("A{}", row + 1), formula);
    }

    for row in 1..=formulas.len() {
        assert_eq!(
            wb.get_cell("Sheet1", &format!("A{row}")),
            Value::Error(ValueError::InvalidRef),
            "A{row} must propagate a missing range sheet as #REF!"
        );
    }
}
