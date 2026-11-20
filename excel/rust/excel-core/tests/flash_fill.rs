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

#[test]
fn flash_fill_rejects_single_example_unrelated_words_and_supports_dates_cjk_filters_and_locked_examples() {
    // 1. Single-example unrelated words must not synthesize bogus initial+literal hybrids
    for unrelated in ["Approved", "Yes", "USA", "N/A", "Active"] {
        let mut wb = Workbook::new();
        let mut hist = WorkbookHistory::default();
        wb.set_cell_input(0, "A1", "Alice Smith").unwrap();
        wb.set_cell_input(0, "A2", "Bob Jones").unwrap();
        wb.set_cell_input(0, "A3", "Carol Lee").unwrap();
        wb.set_cell_input(0, "B1", unrelated).unwrap();
        assert!(
            hist.apply_auto_fill(&mut wb, &flash_request(0, "B2", "B2"))
                .is_err(),
            "unrelated={unrelated} should be rejected"
        );
        assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
    }

    // 2. Formatted dates use display text rather than raw serial numbers
    let mut date_wb = Workbook::new();
    let mut date_hist = WorkbookHistory::default();
    date_wb.set_cell_input(0, "A1", "2026-03-15").unwrap();
    date_wb.set_cell_input(0, "A2", "2025-11-04").unwrap();
    date_wb.set_cell_input(0, "A3", "2024-07-22").unwrap();
    date_wb.set_cell_input(0, "B1", "2026").unwrap();
    date_hist
        .apply_auto_fill(&mut date_wb, &flash_request(0, "B2", "B2"))
        .unwrap();
    assert_eq!(date_wb.get_cell("Sheet1", "B2"), Value::Number(2025.0));
    assert_eq!(date_wb.get_cell("Sheet1", "B3"), Value::Number(2024.0));

    // 3. CJK 2-char suffix extraction and fullwidth delimiter extraction
    let mut cjk_wb = Workbook::new();
    let mut cjk_hist = WorkbookHistory::default();
    cjk_wb.set_cell_input(0, "A1", "张伟").unwrap();
    cjk_wb.set_cell_input(0, "A2", "王芳").unwrap();
    cjk_wb.set_cell_input(0, "A3", "李娜").unwrap();
    cjk_wb.set_cell_input(0, "B1", "伟").unwrap();
    cjk_wb.set_cell_input(0, "B2", "芳").unwrap();
    cjk_hist
        .apply_auto_fill(&mut cjk_wb, &flash_request(0, "B3", "B3"))
        .unwrap();
    assert_eq!(cjk_wb.get_cell("Sheet1", "B3"), Value::Text("娜".into()));

    cjk_wb.set_cell_input(0, "D1", "单号：SO-100").unwrap();
    cjk_wb.set_cell_input(0, "D2", "单号：SO-205").unwrap();
    cjk_wb.set_cell_input(0, "E1", "SO-100").unwrap();
    cjk_hist
        .apply_auto_fill(&mut cjk_wb, &flash_request(0, "E2", "E2"))
        .unwrap();
    assert_eq!(cjk_wb.get_cell("Sheet1", "E2"), Value::Text("SO-205".into()));

    // 4. Active AutoFilter skips hidden rows during example collection and target writes
    let mut filt_wb = Workbook::new();
    let mut filt_hist = WorkbookHistory::default();
    filt_wb.set_cell_input(0, "A1", "Region").unwrap();
    filt_wb.set_cell_input(0, "B1", "Rep").unwrap();
    filt_wb.set_cell_input(0, "C1", "First").unwrap();
    filt_wb.set_cell_input(0, "A2", "East").unwrap();
    filt_wb.set_cell_input(0, "B2", "Alice Smith").unwrap();
    filt_wb.set_cell_input(0, "C2", "Alice").unwrap();
    filt_wb.set_cell_input(0, "A3", "West").unwrap();
    filt_wb.set_cell_input(0, "B3", "Bob Jones").unwrap();
    filt_wb.set_cell_input(0, "C3", "HIDDEN_CONFLICT").unwrap();
    filt_wb.set_cell_input(0, "A4", "East").unwrap();
    filt_wb.set_cell_input(0, "B4", "Carol Lee").unwrap();
    filt_wb
        .apply_filter_range(
            0,
            CellRange::new(addr("A1"), addr("C4")),
            &[einfach_excel_core::ColumnFilterRule::Equals {
                col_index: 0,
                value: "East".into(),
                case_sensitive: false,
            }],
        )
        .unwrap();
    let report = filt_hist
        .apply_auto_fill(&mut filt_wb, &flash_request(0, "C4", "C4"))
        .unwrap();
    assert_eq!(report.written, 1);
    assert_eq!(filt_wb.get_cell("Sheet1", "C3"), Value::Text("HIDDEN_CONFLICT".into()));
    assert_eq!(filt_wb.get_cell("Sheet1", "C4"), Value::Text("Carol".into()));

    // 5. Locked pre-filled example row between unlocked target slots succeeds via begin_ranges
    let mut lock_wb = Workbook::new();
    let mut lock_hist = WorkbookHistory::default();
    lock_wb.set_cell_input(0, "A1", "Alice Smith").unwrap();
    lock_wb.set_cell_input(0, "A2", "Bob Jones").unwrap();
    lock_wb.set_cell_input(0, "B2", "Bob").unwrap();
    lock_wb.set_cell_input(0, "A3", "Carol Lee").unwrap();
    lock_wb
        .change_protection(
            0,
            ProtectionChange::AllowRange {
                range: CellRange::new(addr("B1"), addr("B1")).into(),
            },
        )
        .unwrap();
    lock_wb
        .change_protection(
            0,
            ProtectionChange::AllowRange {
                range: CellRange::new(addr("B3"), addr("B3")).into(),
            },
        )
        .unwrap();
    lock_wb.change_protection(0, ProtectionChange::Protect).unwrap();
    let report = lock_hist
        .apply_auto_fill(&mut lock_wb, &flash_request(0, "B1", "B3"))
        .unwrap();
    assert_eq!(report.written, 2);
    assert_eq!(lock_wb.get_cell("Sheet1", "B1"), Value::Text("Alice".into()));
    assert_eq!(lock_wb.get_cell("Sheet1", "B3"), Value::Text("Carol".into()));
    assert!(lock_hist.undo(&mut lock_wb).unwrap());
    assert_eq!(lock_wb.get_cell("Sheet1", "B1"), Value::Null);
    assert_eq!(lock_wb.get_cell("Sheet1", "B3"), Value::Null);
}
