use einfach_core::Value;
use einfach_excel_core::protection::ProtectionChange;
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    AutoFillDirection, AutoFillNamedLists, AutoFillRequest, AutoFillSeries, CellAddress, CellRange,
    Workbook,
};

fn addr(a1: &str) -> CellAddress {
    CellAddress::parse(a1).unwrap()
}

fn flash_request(sheet: usize, start: &str, end: &str) -> AutoFillRequest {
    let range = CellRange::new(addr(start), addr(end));
    AutoFillRequest {
        sheet_idx: sheet,
        source_range: range,
        target_range: range,
        direction: AutoFillDirection::Down,
        series: AutoFillSeries::FlashFill,
        step: None,
        text_pattern: None,
        list: None,
        named_lists: AutoFillNamedLists::empty(),
    }
}

#[test]
fn flash_fill_splits_names_domains_codes_and_undoes_in_one_step() {
    let mut wb = Workbook::new();
    let mut hist = WorkbookHistory::default();
    for (row, full) in ["Alice Smith", "Bob Jones", "Carol Lee", "David Wu"]
        .iter()
        .enumerate()
    {
        wb.set_cell_input(0, &format!("A{}", row + 1), full)
            .unwrap();
    }
    // Example 1: extract first name into B1, trigger from single cell B2
    wb.set_cell_input(0, "B1", "Alice").unwrap();
    let report = hist
        .apply_auto_fill(&mut wb, &flash_request(0, "B2", "B2"))
        .unwrap();
    assert_eq!(report.written, 3);
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Text("Bob".into()));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Text("Carol".into()));
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Text("David".into()));

    // Single undo clears B2:B4 and leaves example B1 intact
    assert!(hist.undo(&mut wb).unwrap());
    assert_eq!(wb.get_cell("Sheet1", "B1"), Value::Text("Alice".into()));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Null);

    // Example 2: reverse last, first into B1 ("Smith, Alice")
    wb.set_cell_input(0, "B1", "Smith, Alice").unwrap();
    hist.apply_auto_fill(&mut wb, &flash_request(0, "B1", "B1"))
        .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Text("Jones, Bob".into()));
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Text("Lee, Carol".into()));
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Text("Wu, David".into()));

    // Example 3: email domain extraction
    let mut wb2 = Workbook::new();
    let mut hist2 = WorkbookHistory::default();
    wb2.set_cell_input(0, "A1", "alice@example.com").unwrap();
    wb2.set_cell_input(0, "A2", "bob@corp.org").unwrap();
    wb2.set_cell_input(0, "A3", "carol@dev.io").unwrap();
    wb2.set_cell_input(0, "B1", "example.com").unwrap();
    hist2
        .apply_auto_fill(&mut wb2, &flash_request(0, "B1", "B1"))
        .unwrap();
    assert_eq!(wb2.get_cell("Sheet1", "B2"), Value::Text("corp.org".into()));
    assert_eq!(wb2.get_cell("Sheet1", "B3"), Value::Text("dev.io".into()));

    // Example 4: middle code segment extraction (preserves numeric vs text appropriately)
    let mut wb3 = Workbook::new();
    let mut hist3 = WorkbookHistory::default();
    wb3.set_cell_input(0, "A1", "SO-10001-US").unwrap();
    wb3.set_cell_input(0, "A2", "SO-10042-EU").unwrap();
    wb3.set_cell_input(0, "A3", "SO-20500-JP").unwrap();
    wb3.set_cell_input(0, "B1", "US").unwrap();
    hist3
        .apply_auto_fill(&mut wb3, &flash_request(0, "B1", "B1"))
        .unwrap();
    assert_eq!(wb3.get_cell("Sheet1", "B2"), Value::Text("EU".into()));
    assert_eq!(wb3.get_cell("Sheet1", "B3"), Value::Text("JP".into()));
}

#[test]
fn flash_fill_combines_multiple_columns_skips_headers_and_formats_case_and_phones() {
    let mut wb = Workbook::new();
    let mut hist = WorkbookHistory::default();
    // Row 1 is a header row ("First", "Last", "Email")
    wb.set_cell_input(0, "A1", "First").unwrap();
    wb.set_cell_input(0, "B1", "Last").unwrap();
    wb.set_cell_input(0, "C1", "Email").unwrap();
    wb.set_cell_input(0, "A2", "Alice").unwrap();
    wb.set_cell_input(0, "B2", "Smith").unwrap();
    wb.set_cell_input(0, "C2", "alice.smith@acme.com").unwrap();
    wb.set_cell_input(0, "A3", "Bob").unwrap();
    wb.set_cell_input(0, "B3", "Jones").unwrap();
    wb.set_cell_input(0, "A4", "Carol").unwrap();
    wb.set_cell_input(0, "B4", "Chen").unwrap();

    // Triggering from C3 auto-skips header C1 ("Email") and synthesizes from C2
    let report = hist
        .apply_auto_fill(&mut wb, &flash_request(0, "C3", "C3"))
        .unwrap();
    assert_eq!(report.written, 2);
    assert_eq!(wb.get_cell("Sheet1", "C1"), Value::Text("Email".into()));
    assert_eq!(
        wb.get_cell("Sheet1", "C3"),
        Value::Text("bob.jones@acme.com".into())
    );
    assert_eq!(
        wb.get_cell("Sheet1", "C4"),
        Value::Text("carol.chen@acme.com".into())
    );

    // Phone reformatting via fixed character slices
    let mut wb2 = Workbook::new();
    let mut hist2 = WorkbookHistory::default();
    wb2.set_cell_input(0, "A1", "'2125551234").unwrap();
    wb2.set_cell_input(0, "A2", "'4155559876").unwrap();
    wb2.set_cell_input(0, "A3", "'3125550000").unwrap();
    wb2.set_cell_input(0, "B1", "(212) 555-1234").unwrap();
    hist2
        .apply_auto_fill(&mut wb2, &flash_request(0, "B1", "B1"))
        .unwrap();
    assert_eq!(
        wb2.get_cell("Sheet1", "B2"),
        Value::Text("(415) 555-9876".into())
    );
    assert_eq!(
        wb2.get_cell("Sheet1", "B3"),
        Value::Text("(312) 555-0000".into())
    );

    // Case cleanup (Trim + Title)
    let mut wb3 = Workbook::new();
    let mut hist3 = WorkbookHistory::default();
    wb3.set_cell_input(0, "A1", "  alice   smith ").unwrap();
    wb3.set_cell_input(0, "A2", "  BOB   jONES  ").unwrap();
    wb3.set_cell_input(0, "B1", "Alice Smith").unwrap();
    hist3
        .apply_auto_fill(&mut wb3, &flash_request(0, "B1", "B1"))
        .unwrap();
    assert_eq!(wb3.get_cell("Sheet1", "B2"), Value::Text("Bob Jones".into()));
}

#[test]
fn flash_fill_enforces_protection_and_respects_table_boundaries() {
    let mut wb = Workbook::new();
    let mut hist = WorkbookHistory::default();
    wb.set_cell_input(0, "A1", "Name").unwrap();
    wb.set_cell_input(0, "B1", "Initials").unwrap();
    wb.set_cell_input(0, "A2", "Alice Smith").unwrap();
    wb.set_cell_input(0, "B2", "AS").unwrap();
    wb.set_cell_input(0, "A3", "Bob Jones").unwrap();
    wb.set_cell_input(0, "A4", "Carol Lee").unwrap();
    wb.define_table(
        Some("People"),
        0,
        CellRange::new(addr("A1"), addr("B4")),
        true,
    )
    .unwrap();

    // Protect sheet with only B2:B3 unlocked -> writing B4 is rejected atomically
    wb.change_protection(
        0,
        ProtectionChange::AllowRange {
            range: CellRange::new(addr("B2"), addr("B3")).into(),
        },
    )
    .unwrap();
    wb.change_protection(0, ProtectionChange::Protect).unwrap();
    assert!(hist
        .apply_auto_fill(&mut wb, &flash_request(0, "B2", "B2"))
        .is_err());
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Null);

    // Explicit range B2:B3 inside unlocked area succeeds
    let report = hist
        .apply_auto_fill(&mut wb, &flash_request(0, "B2", "B3"))
        .unwrap();
    assert_eq!(report.written, 1);
    assert_eq!(wb.get_cell("Sheet1", "B3"), Value::Text("BJ".into()));
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Null);

    // Unprotect and fill remaining cell B4 inside the table
    wb.change_protection(0, ProtectionChange::Unprotect).unwrap();
    let report = hist
        .apply_auto_fill(&mut wb, &flash_request(0, "B4", "B4"))
        .unwrap();
    assert_eq!(report.written, 1);
    assert_eq!(wb.get_cell("Sheet1", "B4"), Value::Text("CL".into()));
}
