use einfach_core::{Value, ValueError};
use einfach_excel_core::consolidate::{
    ConsolidateFunction, ConsolidateOverwriteApproval, ConsolidateRequest, ConsolidateSource,
};
use einfach_excel_core::outline::OutlineAxis;
use einfach_excel_core::protection::{ProtectionMode, SheetProtection};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, MergeAction, Workbook};

fn addr(text: &str) -> CellAddress {
    CellAddress::parse(text).unwrap()
}

fn range(start: &str, end: &str) -> CellRange {
    CellRange::new(addr(start), addr(end))
}

fn set_text(book: &mut Workbook, sheet: usize, cell: &str, text: &str) {
    book.set_cell(sheet, cell, Value::Text(text.into()));
}

fn two_quarter_book() -> (Workbook, usize, usize, usize) {
    let mut book = Workbook::new();
    let q1 = book.add_sheet("Q1 Sales");
    let q2 = book.add_sheet("Q2 Sales");
    let summary = 0;

    // Q1 Sales: A1:C4
    set_text(&mut book, q1, "A1", "Item");
    set_text(&mut book, q1, "B1", "Units");
    set_text(&mut book, q1, "C1", "Revenue");
    set_text(&mut book, q1, "A2", "Apples");
    book.set_cell(q1, "B2", Value::Number(10.0));
    book.set_cell(q1, "C2", Value::Number(100.0));
    set_text(&mut book, q1, "A3", "Bananas");
    book.set_cell(q1, "B3", Value::Number(20.0));
    book.set_cell(q1, "C3", Value::Number(160.0));
    set_text(&mut book, q1, "A4", "apples"); // duplicate case-insensitive row in same sheet
    book.set_cell(q1, "B4", Value::Number(5.0));
    book.set_cell(q1, "C4", Value::Number(50.0));

    // Q2 Sales: A1:C3 (swapped columns & new category Cherries)
    set_text(&mut book, q2, "A1", "Item");
    set_text(&mut book, q2, "B1", "Revenue");
    set_text(&mut book, q2, "C1", "Units");
    set_text(&mut book, q2, "A2", "Bananas");
    book.set_cell(q2, "B2", Value::Number(240.0));
    book.set_cell(q2, "C2", Value::Number(30.0));
    set_text(&mut book, q2, "A3", "Cherries");
    book.set_cell(q2, "B3", Value::Number(300.0));
    book.set_cell(q2, "C3", Value::Number(15.0));

    (book, summary, q1, q2)
}

#[test]
fn category_2d_consolidate_matches_labels_case_insensitively_and_supports_undo() {
    let (mut book, summary, q1, q2) = two_quarter_book();
    let mut history = WorkbookHistory::default();
    let req = ConsolidateRequest {
        function: ConsolidateFunction::Sum,
        sources: vec![
            ConsolidateSource { sheet: q1, range: range("A1", "C4") },
            ConsolidateSource { sheet: q2, range: range("A1", "C3") },
        ],
        sheet: summary,
        destination: addr("A1"),
        top_row: true,
        left_column: true,
        create_links: false,
        row_count: 50,
        col_count: 10,
    };
    let preview = book.preview_consolidate(&req).unwrap();
    assert_eq!(preview.target, range("A1", "C4"));
    assert_eq!(preview.overwritten_cells, 0);
    assert_eq!(preview.sample[0], ["Item", "Units", "Revenue"]);
    assert_eq!(preview.sample[1], ["Apples", "15", "150"]);

    let report = history.consolidate(&mut book, &req, None).unwrap();
    assert_eq!(report.target, range("A1", "C4"));
    assert_eq!(report.linked_groups, 0);
    assert_eq!(book.get_cell("Sheet1", "A1"), Value::Text("Item".into()));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Text("Units".into()));
    assert_eq!(book.get_cell("Sheet1", "C1"), Value::Text("Revenue".into()));
    assert_eq!(book.get_cell("Sheet1", "A2"), Value::Text("Apples".into()));
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Number(15.0));
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(150.0));
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("Bananas".into()));
    assert_eq!(book.get_cell("Sheet1", "B3"), Value::Number(50.0));
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(400.0));
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Text("Cherries".into()));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(15.0));
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(300.0));

    assert_eq!(history.undo_count(), 1);
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Null);
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(400.0));
}

#[test]
fn position_consolidate_evaluates_all_eleven_functions() {
    let mut book = Workbook::new();
    let s1 = book.add_sheet("S1");
    let s2 = book.add_sheet("S2");
    book.set_cell(s1, "A1", Value::Number(2.0));
    book.set_cell(s2, "A1", Value::Number(4.0));
    book.set_cell(s1, "B1", Value::Text("note".into()));
    book.set_cell(s2, "B1", Value::Number(6.0));

    let expected = [
        (ConsolidateFunction::Sum, Value::Number(6.0), Value::Number(6.0)),
        (ConsolidateFunction::Count, Value::Number(2.0), Value::Number(2.0)),
        (ConsolidateFunction::Average, Value::Number(3.0), Value::Number(6.0)),
        (ConsolidateFunction::Max, Value::Number(4.0), Value::Number(6.0)),
        (ConsolidateFunction::Min, Value::Number(2.0), Value::Number(6.0)),
        (ConsolidateFunction::Product, Value::Number(8.0), Value::Number(6.0)),
        (ConsolidateFunction::CountNumbers, Value::Number(2.0), Value::Number(1.0)),
        (ConsolidateFunction::SampleVariance, Value::Number(2.0), Value::Error(ValueError::DivisionByZero)),
        (ConsolidateFunction::PopulationVariance, Value::Number(1.0), Value::Number(0.0)),
        (ConsolidateFunction::SampleStandardDeviation, Value::Number(2.0_f64.sqrt()), Value::Error(ValueError::DivisionByZero)),
        (ConsolidateFunction::PopulationStandardDeviation, Value::Number(1.0), Value::Number(0.0)),
    ];
    for (func, exp_a, exp_b) in expected {
        let mut history = WorkbookHistory::default();
        let req = ConsolidateRequest {
            function: func,
            sources: vec![
                ConsolidateSource { sheet: s1, range: range("A1", "B1") },
                ConsolidateSource { sheet: s2, range: range("A1", "B1") },
            ],
            sheet: 0,
            destination: addr("A1"),
            top_row: false,
            left_column: false,
            create_links: false,
            row_count: 20,
            col_count: 10,
        };
        let preview = book.preview_consolidate(&req).unwrap();
        let approval = (preview.overwritten_cells > 0).then_some(ConsolidateOverwriteApproval {
            target: preview.target,
            count: preview.overwritten_cells,
        });
        history.consolidate(&mut book, &req, approval).unwrap();
        assert_eq!(book.get_cell("Sheet1", "A1"), exp_a, "func={func:?} A1");
        assert_eq!(book.get_cell("Sheet1", "B1"), exp_b, "func={func:?} B1");
    }
}

#[test]
fn linked_consolidate_creates_live_cross_sheet_formulas_outlines_and_atomic_undo() {
    let (mut book, summary, q1, q2) = two_quarter_book();
    let mut history = WorkbookHistory::default();
    let req = ConsolidateRequest {
        function: ConsolidateFunction::Sum,
        sources: vec![
            ConsolidateSource { sheet: q1, range: range("A1", "C4") },
            ConsolidateSource { sheet: q2, range: range("A1", "C3") },
        ],
        sheet: summary,
        destination: addr("A1"),
        top_row: true,
        left_column: true,
        create_links: true,
        row_count: 50,
        col_count: 10,
    };
    let report = history.consolidate(&mut book, &req, None).unwrap();
    // Header (1) + Apples (2 detail + 1 summary = 3) + Bananas (2 detail + 1 summary = 3) + Cherries (1 detail + 1 summary = 2) = 9 rows
    assert_eq!(report.target, range("A1", "C9"));
    assert_eq!(report.linked_groups, 3);
    assert_eq!(book.sheet(summary).unwrap().outline().rows.len(), 3);
    // Row 4 (index 3) is Apples summary = SUM(B2:B3) -> 15
    assert_eq!(book.get_cell("Sheet1", "A4"), Value::Text("Apples".into()));
    assert_eq!(book.sheet(summary).unwrap().get_formula("B4").as_deref(), Some("=SUM(B2:B3)"));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(15.0));
    // Row 7 (index 6) is Bananas summary -> 50 units, 400 revenue
    assert_eq!(book.get_cell("Sheet1", "B7"), Value::Number(50.0));
    assert_eq!(book.get_cell("Sheet1", "C7"), Value::Number(400.0));

    // Live link updates when Q1 Sales!B2 changes from 10 to 100
    book.set_cell(q1, "B2", Value::Number(100.0));
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(105.0));

    // One undo removes both formulas and outline groups atomically
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Null);
    assert!(book.sheet(summary).unwrap().outline().rows.is_empty());
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "B4"), Value::Number(105.0));
    assert_eq!(book.sheet(summary).unwrap().outline().rows.len(), 3);
    assert!(!book.sheet(summary).unwrap().outline().is_hidden(OutlineAxis::Row, 1));
}

#[test]
fn consolidate_guards_overwrite_same_sheet_links_merges_and_protection() {
    let (mut book, summary, q1, q2) = two_quarter_book();
    let mut history = WorkbookHistory::default();
    book.set_cell(summary, "B2", Value::Text("Occupied".into()));

    let mut req = ConsolidateRequest {
        function: ConsolidateFunction::Sum,
        sources: vec![ConsolidateSource { sheet: summary, range: range("E1", "F2") }],
        sheet: summary,
        destination: addr("A1"),
        top_row: false,
        left_column: false,
        create_links: true,
        row_count: 50,
        col_count: 10,
    };
    assert!(book.preview_consolidate(&req).unwrap_err().contains("other worksheets"));

    req.create_links = false;
    req.sources = vec![
        ConsolidateSource { sheet: q1, range: range("A1", "C4") },
        ConsolidateSource { sheet: q2, range: range("A1", "C3") },
    ];
    req.top_row = true;
    req.left_column = true;
    let preview = book.preview_consolidate(&req).unwrap();
    assert_eq!(preview.overwritten_cells, 1);
    assert_eq!(
        history.consolidate(&mut book, &req, None).unwrap_err(),
        "CONSOLIDATE_OVERWRITE_CONFIRMATION_REQUIRED"
    );
    assert_eq!(book.get_cell("Sheet1", "B2"), Value::Text("Occupied".into()));

    // Merge guard
    book.merge_cells(summary, range("A1", "A2"), MergeAction::Merge, true).unwrap();
    assert!(book.preview_consolidate(&req).unwrap_err().contains("merged"));
    book.merge_cells(summary, range("A1", "A2"), MergeAction::Unmerge, true).unwrap();

    // Protection guard
    book.restore_protection(vec![(
        summary,
        SheetProtection { mode: ProtectionMode::Protected, unlocked_ranges: Vec::new() },
    )]).unwrap();
    assert!(book.preview_consolidate(&req).is_err());
}
