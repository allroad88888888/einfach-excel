use einfach_core::{Value, ValueError};
use einfach_excel_core::formula::{RangeAbs, RangeBounds, RefAbs};
use einfach_excel_core::shift::shift_copy_formula;
use einfach_excel_core::{
    parse_formula, render_formula, shift_refs, CellAddress, Expr, Workbook,
};

fn addr(row: u32, col: u32) -> CellAddress {
    CellAddress::new(row, col)
}

#[test]
fn parses_and_renders_3d_references_across_quoting_conventions() {
    let ast_cell = parse_formula("=Sheet1:Sheet3!A1").expect("parse Sheet1:Sheet3!A1");
    assert_eq!(
        ast_cell,
        Expr::Sheet3DRef {
            start_sheet: "Sheet1".to_string(),
            end_sheet: "Sheet3".to_string(),
            addr: addr(0, 0),
            abs: RefAbs::REL,
        }
    );
    assert_eq!(render_formula(&ast_cell), "=Sheet1:Sheet3!A1");

    let ast_range = parse_formula("=SUM(Sheet1:Sheet3!$A$1:B$2)").expect("parse 3D range");
    assert_eq!(render_formula(&ast_range), "=SUM(Sheet1:Sheet3!$A$1:B$2)");
    assert_eq!(
        parse_formula(&render_formula(&ast_range)),
        Some(ast_range.clone())
    );

    // Col-letter-shaped sheet names (`Jan:Mar`) and cell-shaped sheet names (`Q1:Q4`)
    let jan_mar = parse_formula("=AVERAGE(Jan:Mar!C5)").expect("parse Jan:Mar!C5");
    assert_eq!(render_formula(&jan_mar), "=AVERAGE(Jan:Mar!C5)");
    let q1_q4 = parse_formula("=SUM(Q1:Q4!A1:B2)").expect("parse Q1:Q4!A1:B2");
    assert_eq!(
        q1_q4,
        Expr::FuncCall {
            name: "SUM".to_string(),
            args: vec![Expr::Sheet3DRange {
                start_sheet: "Q1".to_string(),
                end_sheet: "Q4".to_string(),
                start: addr(0, 0),
                end: addr(1, 1),
                unbounded: RangeBounds::None,
                abs: RangeAbs::new(RefAbs::REL, RefAbs::REL),
            }],
        }
    );
    assert_eq!(render_formula(&q1_q4), "=SUM(Q1:Q4!A1:B2)");

    // Both standard Excel 3D quoting conventions produce identical ASTs:
    // 1) Single-quoted span: `'Sheet 1:Sheet 3'!A1:B2`
    // 2) Individually quoted endpoints: `'Sheet 1':'Sheet 3'!A1:B2`
    let single_quoted =
        parse_formula("=SUM('Sheet 1:Sheet 3'!A1:B2)").expect("parse 'Sheet 1:Sheet 3'!A1:B2");
    let double_quoted =
        parse_formula("=SUM('Sheet 1':'Sheet 3'!A1:B2)").expect("parse 'Sheet 1':'Sheet 3'!A1:B2");
    assert_eq!(single_quoted, double_quoted);
    assert_eq!(
        render_formula(&single_quoted),
        "=SUM('Sheet 1:Sheet 3'!A1:B2)"
    );
    assert_eq!(
        parse_formula(&render_formula(&single_quoted)),
        Some(single_quoted)
    );

    // Mixed quoting (`'Sheet 1':Sheet3!A1` and `Sheet1:'Sheet 3'!A1`)
    let mixed_left = parse_formula("='Sheet 1':Sheet3!A1").expect("mixed left");
    let mixed_right = parse_formula("=Sheet1:'Sheet 3'!A1").expect("mixed right");
    assert_eq!(render_formula(&mixed_left), "='Sheet 1:Sheet3'!A1");
    assert_eq!(render_formula(&mixed_right), "='Sheet1:Sheet 3'!A1");
}

#[test]
fn shift_and_copy_preserve_3d_references() {
    let expr = parse_formula("=SUM(Sheet1:Sheet3!A1:$B2)").unwrap();
    // Delta shift (within-sheet paste) leaves cross-sheet 3D refs untouched
    assert_eq!(shift_refs(&expr, 2, 3).unwrap(), expr);
    // Copy formula shifts relative coordinates while honoring $ locks
    let copied = shift_copy_formula(&expr, 2, 3).unwrap();
    assert_eq!(render_formula(&copied), "=SUM(Sheet1:Sheet3!D3:$B4)");
}

#[test]
fn evaluates_3d_span_in_tab_order_and_case_insensitively() {
    let mut wb = Workbook::new(); // Sheet1 (idx 0)
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sheet3");
    let summary = wb.add_sheet("Summary");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(0, "B1", Value::Number(20.0));
    wb.set_cell(s2, "A1", Value::Number(30.0));
    wb.set_cell(s2, "B1", Value::Number(40.0));
    wb.set_cell(s3, "A1", Value::Number(50.0));
    wb.set_cell(s3, "B1", Value::Number(60.0));

    // Standard order Sheet1:Sheet3!A1:B1 -> 10+20+30+40+50+60 = 210
    wb.set_formula(summary, "A1", "=SUM(Sheet1:Sheet3!A1:B1)");
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(210.0));

    // Reversed endpoint order Sheet3:Sheet1!A1:B1 -> still min(idx_a, idx_b)..=max(idx_a, idx_b) = 210
    wb.set_formula(summary, "A2", "=SUM(Sheet3:Sheet1!A1:B1)");
    assert_eq!(wb.get_cell("Summary", "A2"), Value::Number(210.0));

    // Case-insensitive matching with single-quoted span
    wb.set_formula(summary, "A3", "=AVERAGE('sheet1:SHEET3'!A1)");
    assert_eq!(wb.get_cell("Summary", "A3"), Value::Number(30.0));

    // Single-sheet degenerate 3D span Sheet2:Sheet2!A1:B1 -> 30+40 = 70
    wb.set_formula(summary, "A4", "=SUM(Sheet2:Sheet2!A1:B1)");
    assert_eq!(wb.get_cell("Summary", "A4"), Value::Number(70.0));
}

#[test]
fn missing_endpoint_returns_ref_error_and_standalone_scalar_returns_wrong_type() {
    let mut wb = Workbook::new();
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sheet3");
    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(s2, "A1", Value::Number(20.0));

    // Missing start_sheet or end_sheet -> #REF! (InvalidRef)
    wb.set_formula(s3, "A1", "=SUM(Sheet1:NoSuchSheet!A1)");
    assert_eq!(
        wb.get_cell("Sheet3", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
    wb.set_formula(s3, "B1", "=NoSuchSheet:Sheet2!A1");
    assert_eq!(
        wb.get_cell("Sheet3", "B1"),
        Value::Error(ValueError::InvalidRef)
    );

    // Direct standalone scalar evaluation without an aggregating function -> #VALUE! (WrongType)
    wb.set_formula(s3, "A2", "=Sheet1:Sheet2!A1");
    assert_eq!(
        wb.get_cell("Sheet3", "A2"),
        Value::Error(ValueError::WrongType)
    );
    wb.set_formula(s3, "B2", "=Sheet1:Sheet2!A1:B2");
    assert_eq!(
        wb.get_cell("Sheet3", "B2"),
        Value::Error(ValueError::WrongType)
    );
}

#[test]
fn supports_excel_3d_aggregation_functions() {
    let mut wb = Workbook::new(); // Sheet1
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sheet3");
    let out = wb.add_sheet("Out");

    // Populate A1, A2, B1 across Sheet1..Sheet3:
    // Sheet1: A1=2, A2=4, B1=TRUE
    // Sheet2: A1=6, A2=8, B1="text"
    // Sheet3: A1=10, A2=12, B1=FALSE
    wb.set_cell(0, "A1", Value::Number(2.0));
    wb.set_cell(0, "A2", Value::Number(4.0));
    wb.set_cell(0, "B1", Value::Boolean(true));
    wb.set_cell(0, "C1", Value::Boolean(true));

    wb.set_cell(s2, "A1", Value::Number(6.0));
    wb.set_cell(s2, "A2", Value::Number(8.0));
    wb.set_cell(s2, "B1", Value::Text("text".into()));
    wb.set_cell(s2, "C1", Value::Boolean(true));

    wb.set_cell(s3, "A1", Value::Number(10.0));
    wb.set_cell(s3, "A2", Value::Number(12.0));
    wb.set_cell(s3, "B1", Value::Boolean(false));
    wb.set_cell(s3, "C1", Value::Boolean(false));

    let cases: &[(&str, Value)] = &[
        ("=SUM(Sheet1:Sheet3!A1:A2)", Value::Number(42.0)),
        ("=AVERAGE(Sheet1:Sheet3!A1:A2)", Value::Number(7.0)),
        ("=AVERAGEA(Sheet1:Sheet3!B1)", Value::Number(1.0 / 3.0)),
        ("=COUNT(Sheet1:Sheet3!A1:B2)", Value::Number(6.0)),
        ("=COUNTA(Sheet1:Sheet3!A1:B2)", Value::Number(9.0)),
        ("=MAX(Sheet1:Sheet3!A1:A2)", Value::Number(12.0)),
        ("=MAXA(Sheet1:Sheet3!B1)", Value::Number(1.0)),
        ("=MIN(Sheet1:Sheet3!A1:A2)", Value::Number(2.0)),
        ("=MINA(Sheet1:Sheet3!B1)", Value::Number(0.0)),
        ("=PRODUCT(Sheet1:Sheet3!A1)", Value::Number(120.0)),
        ("=MEDIAN(Sheet1:Sheet3!A1:A2)", Value::Number(7.0)),
        ("=VAR.P(Sheet1:Sheet3!A1)", Value::Number(32.0 / 3.0)),
        ("=VARP(Sheet1:Sheet3!A1)", Value::Number(32.0 / 3.0)),
        ("=VAR.S(Sheet1:Sheet3!A1)", Value::Number(16.0)),
        ("=VAR(Sheet1:Sheet3!A1)", Value::Number(16.0)),
        ("=STDEV.S(Sheet1:Sheet3!A1)", Value::Number(4.0)),
        ("=STDEV(Sheet1:Sheet3!A1)", Value::Number(4.0)),
        (
            "=STDEV.P(Sheet1:Sheet3!A1)",
            Value::Number((32.0_f64 / 3.0).sqrt()),
        ),
        (
            "=STDEVP(Sheet1:Sheet3!A1)",
            Value::Number((32.0_f64 / 3.0).sqrt()),
        ),
        ("=LARGE(Sheet1:Sheet3!A1:A2, 2)", Value::Number(10.0)),
        ("=SMALL(Sheet1:Sheet3!A1:A2, 2)", Value::Number(4.0)),
        ("=PERCENTILE(Sheet1:Sheet3!A1:A2, 0.5)", Value::Number(7.0)),
        ("=QUARTILE(Sheet1:Sheet3!A1:A2, 2)", Value::Number(7.0)),
        ("=AND(Sheet1:Sheet3!C1)", Value::Boolean(false)),
        ("=OR(Sheet1:Sheet3!C1)", Value::Boolean(true)),
        ("=XOR(Sheet1:Sheet3!C1)", Value::Boolean(false)),
        ("=SHEETS(Sheet1:Sheet3!A1:A2)", Value::Number(3.0)),
        ("=AREAS(Sheet1:Sheet3!A1:A2)", Value::Number(1.0)),
        ("=ISREF(Sheet1:Sheet3!A1:A2)", Value::Boolean(true)),
    ];

    for (i, (formula, expected)) in cases.iter().enumerate() {
        let cell_ref = format!("A{}", i + 1);
        wb.set_formula(out, &cell_ref, formula);
        let actual = wb.get_cell("Out", &cell_ref);
        match (actual, expected) {
            (Value::Number(a), Value::Number(b)) => {
                assert!(
                    (a - b).abs() < 1e-9,
                    "formula {formula} expected {b}, got {a}"
                );
            }
            (a, b) => assert_eq!(&a, b, "formula {formula} mismatch"),
        }
    }
}

#[test]
fn store_tracks_cell_edits_and_sheet_topology_changes_across_3d_span() {
    let mut wb = Workbook::new(); // Sheet1 (0)
    wb.rename_sheet(0, "Jan");
    let feb = wb.add_sheet("Feb");
    let mar = wb.add_sheet("Mar");
    let apr = wb.add_sheet("Apr");
    let total = wb.add_sheet("Total");

    wb.set_cell(0, "A1", Value::Number(10.0));
    wb.set_cell(feb, "A1", Value::Number(20.0));
    wb.set_cell(mar, "A1", Value::Number(30.0));
    wb.set_cell(apr, "A1", Value::Number(100.0));

    wb.set_formula(total, "A1", "=SUM('Jan:Mar'!A1)");
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(60.0));

    // 1. Editing middle sheet (Feb!A1) triggers recalculation
    wb.set_cell(feb, "A1", Value::Number(25.0));
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(65.0));

    // 2. Moving Apr (idx 3) to index 1 (between Jan and Mar) includes Apr in Jan:Mar!A1
    assert!(wb.move_sheet(3, 1));
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(165.0));

    // 3. Moving Apr back out of Jan..Mar excludes it again
    assert!(wb.move_sheet(1, 3));
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(65.0));

    // 4. Removing middle sheet (Feb, now at idx 1) shrinks the span to Jan + Mar = 40
    assert!(wb.remove_sheet(1).is_some());
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(40.0));

    // 5. Renaming endpoint sheet Mar -> March rewrites the formula text and preserves value
    let mar_idx = wb.index_of("Mar").unwrap();
    assert!(wb.rename_sheet(mar_idx, "March"));
    let total_idx = wb.index_of("Total").unwrap();
    assert_eq!(
        wb.sheet(total_idx).unwrap().get_formula("A1").as_deref(),
        Some("=SUM(Jan:March!A1)")
    );
    assert_eq!(wb.get_cell("Total", "A1"), Value::Number(40.0));

    // 6. Removing endpoint sheet March invalidates the 3D reference to #REF!
    let march_idx = wb.index_of("March").unwrap();
    assert!(wb.remove_sheet(march_idx).is_some());
    assert_eq!(
        wb.get_cell("Total", "A1"),
        Value::Error(ValueError::InvalidRef)
    );
}

#[test]
fn detects_direct_and_indirect_cycles_across_3d_sheet_spans() {
    let mut wb = Workbook::new(); // Sheet1 (0)
    let s2 = wb.add_sheet("Sheet2");
    let s3 = wb.add_sheet("Sheet3");

    // 1. Direct cycle: Sheet2 is inside Sheet1:Sheet3, so Sheet2!A1 = SUM(Sheet1:Sheet3!A1:B2) is cyclic
    wb.set_formula(s2, "A1", "=SUM(Sheet1:Sheet3!A1:B2)");
    assert_eq!(
        wb.get_cell("Sheet2", "A1"),
        Value::Error(ValueError::CyclicRef)
    );

    // 2. Indirect cycle: Summary!A1 = SUM(Sheet1:Sheet3!A1), and middle sheet Sheet2!A1 = Summary!A1
    let summary = wb.add_sheet("Summary");
    wb.set_cell(s2, "A1", Value::Number(5.0));
    wb.set_formula(summary, "A1", "=SUM(Sheet1:Sheet3!A1)");
    assert_eq!(wb.get_cell("Summary", "A1"), Value::Number(5.0));

    wb.set_formula(s2, "A1", "=Summary!A1");
    assert_eq!(
        wb.get_cell("Sheet2", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
    assert_eq!(
        wb.get_cell("Summary", "A1"),
        Value::Error(ValueError::CyclicRef)
    );
    let _ = s3;
}
