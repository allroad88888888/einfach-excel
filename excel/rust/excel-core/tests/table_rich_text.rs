use einfach_core::Value;
use einfach_excel_core::protection::{ProtectionChange, ProtectionMode};
use einfach_excel_core::rich_text::{RichTextFormat, RichTextRun};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{
    CellAddress, CellRange, SortDirection, SortKey, TableColumnFormula, TableEntry,
    TableRegistrySnapshot, Workbook,
};

fn addr(a1: &str) -> CellAddress {
    CellAddress::parse(a1).unwrap()
}

fn bold_run(text: &str) -> RichTextRun {
    RichTextRun {
        text: text.to_owned(),
        format: RichTextFormat {
            bold: Some(true),
            color: Some("#C0392B".into()),
            ..Default::default()
        },
    }
}

fn plain_run(text: &str) -> RichTextRun {
    RichTextRun {
        text: text.to_owned(),
        format: RichTextFormat::default(),
    }
}

fn setup_sales_table() -> (Workbook, WorkbookHistory) {
    let mut wb = Workbook::new();
    let hist = WorkbookHistory::default();
    wb.set_cell_input(0, "A1", "Item").unwrap();
    wb.set_cell_input(0, "B1", "Qty").unwrap();
    wb.set_cell_input(0, "A2", "Beta Widget").unwrap();
    wb.set_cell_input(0, "B2", "3").unwrap();
    wb.set_cell_input(0, "A3", "Alpha Bolt").unwrap();
    wb.set_cell_input(0, "B3", "5").unwrap();
    wb.define_table(Some("Sales"), 0, CellRange::new(addr("A1"), addr("B3")), true)
        .unwrap();
    wb.set_cell_input(0, "D1", "=COUNTA(Sales[Item])").unwrap();
    wb.set_cell_input(0, "D2", "=LEN(A2)").unwrap();
    (wb, hist)
}

#[test]
fn table_data_cell_rich_text_updates_formulas_sorts_and_undoes_atomically() {
    let (mut wb, mut hist) = setup_sales_table();
    let runs = vec![bold_run("Gamma"), plain_run(" Gear")];

    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A2"), runs.clone()),
        Ok(true)
    );
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("Gamma Gear".into()));
    assert_eq!(wb.sheet(0).unwrap().rich_text(addr("A2")), Some(runs.as_slice()));
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(2.0));
    assert_eq!(wb.get_cell("Sheet1", "D2"), Value::Number(10.0));

    // Re-saving identical runs is a no-op
    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A2"), runs.clone()),
        Ok(false)
    );

    // Sorting data rows moves rich text runs with the record
    wb.sort_range(
        0,
        CellRange::new(addr("A2"), addr("B3")),
        &[SortKey {
            col: 0,
            direction: SortDirection::Ascending,
            ..Default::default()
        }],
        &[],
    )
    .unwrap();
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("Alpha Bolt".into()));
    assert_eq!(wb.get_cell("Sheet1", "A3"), Value::Text("Gamma Gear".into()));
    assert_eq!(wb.sheet(0).unwrap().rich_text(addr("A3")), Some(runs.as_slice()));
    assert!(wb.sheet(0).unwrap().rich_text(addr("A2")).is_none());

    // Undo on a fresh edit restores original value and clears rich text in one step
    let (mut wb2, mut hist2) = setup_sales_table();
    assert_eq!(
        hist2.change_rich_text(&mut wb2, 0, addr("A2"), runs.clone()),
        Ok(true)
    );
    assert!(hist2.undo(&mut wb2).unwrap());
    assert_eq!(wb2.get_cell("Sheet1", "A2"), Value::Text("Beta Widget".into()));
    assert!(wb2.sheet(0).unwrap().rich_text(addr("A2")).is_none());
    assert!(hist2.redo(&mut wb2).unwrap());
    assert_eq!(wb2.get_cell("Sheet1", "A2"), Value::Text("Gamma Gear".into()));
    assert_eq!(wb2.sheet(0).unwrap().rich_text(addr("A2")), Some(runs.as_slice()));
}

#[test]
fn table_header_rich_text_formats_and_renames_with_structured_ref_rewrite() {
    let (mut wb, mut hist) = setup_sales_table();

    // Formatting-only edit on header preserves column name and formulas
    let fmt_only = vec![bold_run("It"), plain_run("em")];
    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A1"), fmt_only.clone()),
        Ok(true)
    );
    assert_eq!(wb.get_table("Sales").unwrap().columns()[0], "Item");
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A1")),
        Some(fmt_only.as_slice())
    );
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(2.0));

    // Empty or duplicate header names are rejected without mutating
    assert!(hist
        .change_rich_text(&mut wb, 0, addr("A1"), vec![plain_run("   ")])
        .is_err());
    assert!(hist
        .change_rich_text(&mut wb, 0, addr("A1"), vec![bold_run("Qty")])
        .is_err());
    assert_eq!(wb.get_table("Sales").unwrap().columns()[0], "Item");

    // Renaming header via rich text trims whitespace, rewrites structured refs, and keeps runs
    let renamed = vec![plain_run(" "), bold_run("Product"), plain_run(" Name ")];
    let expected_runs = vec![bold_run("Product"), plain_run(" Name")];
    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A1"), renamed),
        Ok(true)
    );
    assert_eq!(wb.get_table("Sales").unwrap().columns()[0], "Product Name");
    assert_eq!(
        wb.sheet(0).unwrap().formula_text_at(addr("D1")).as_deref(),
        Some("=COUNTA(Sales[Product Name])")
    );
    assert_eq!(wb.get_cell("Sheet1", "D1"), Value::Number(2.0));
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A1")),
        Some(expected_runs.as_slice())
    );

    // One undo restores old header name, structured reference, and prior rich-text runs
    assert!(hist.undo(&mut wb).unwrap());
    assert_eq!(wb.get_table("Sales").unwrap().columns()[0], "Item");
    assert_eq!(
        wb.sheet(0).unwrap().formula_text_at(addr("D1")).as_deref(),
        Some("=COUNTA(Sales[Item])")
    );
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A1")),
        Some(fmt_only.as_slice())
    );

    // Plain-text header rename clears stale rich-text runs
    hist.set_cell_input(&mut wb, 0, "A1", "SKU").unwrap();
    assert_eq!(wb.get_table("Sales").unwrap().columns()[0], "SKU");
    assert!(wb.sheet(0).unwrap().rich_text(addr("A1")).is_none());
}

#[test]
fn empty_table_insert_row_rich_text_creates_record_and_inherits_calculated_columns() {
    let mut wb = Workbook::new();
    let mut hist = WorkbookHistory::default();
    wb.set_cell_input(0, "A1", "Label").unwrap();
    wb.set_cell_input(0, "B1", "Length").unwrap();
    let table = TableEntry::from_parts(
        "Notes",
        "Sheet1",
        CellRange::new(addr("A1"), addr("B2")),
        true,
        false,
        vec!["Label".into(), "Length".into()],
    )
    .with_insert_row(true)
    .with_calculated_columns(vec![None, Some(TableColumnFormula::new(1, "=LEN([@Label])").unwrap())]);
    wb.restore_tables(TableRegistrySnapshot::from_entries(vec![table]))
        .unwrap();
    assert!(wb.get_table("Notes").unwrap().has_insert_row());

    let runs = vec![bold_run("Hi"), plain_run(" there")];
    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A2"), runs.clone()),
        Ok(true)
    );
    assert!(!wb.get_table("Notes").unwrap().has_insert_row());
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Text("Hi there".into()));
    assert_eq!(wb.sheet(0).unwrap().rich_text(addr("A2")), Some(runs.as_slice()));
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Number(8.0));

    // One undo restores empty insert_row state and clears inherited formula + rich text
    assert!(hist.undo(&mut wb).unwrap());
    assert!(wb.get_table("Notes").unwrap().has_insert_row());
    assert_eq!(wb.get_cell("Sheet1", "A2"), Value::Null);
    assert!(wb.sheet(0).unwrap().rich_text(addr("A2")).is_none());
    assert_eq!(wb.get_cell("Sheet1", "B2"), Value::Null);
}

#[test]
fn protected_sheet_table_rich_text_enforces_unlocked_ranges_and_blocks_header_rename() {
    let (mut wb, mut hist) = setup_sales_table();
    wb.change_protection(
        0,
        ProtectionChange::AllowRange {
            range: CellRange::new(addr("A1"), addr("A2")).into(),
        },
    )
    .unwrap();
    wb.change_protection(0, ProtectionChange::Protect).unwrap();
    assert_eq!(wb.read_protection(0).unwrap().mode, ProtectionMode::Protected);

    // Unlocked data cell A2 allows rich text edit
    let runs = vec![bold_run("Safe"), plain_run(" edit")];
    assert_eq!(
        hist.change_rich_text(&mut wb, 0, addr("A2"), runs.clone()),
        Ok(true)
    );
    assert_eq!(wb.sheet(0).unwrap().rich_text(addr("A2")), Some(runs.as_slice()));

    // Locked data cell A3 is rejected
    assert!(hist
        .change_rich_text(&mut wb, 0, addr("A3"), vec![bold_run("Locked")])
        .is_err());

    // Header rename is blocked on protected sheet even if A1 is unlocked
    assert!(hist
        .change_rich_text(&mut wb, 0, addr("A1"), vec![bold_run("Renamed")])
        .is_err());
}

#[test]
fn table_mutations_reconcile_rich_text_and_reject_formula_cells() {
    let (mut wb, mut hist) = setup_sales_table();

    // Formula cells cannot be overwritten via change_rich_text
    assert!(hist
        .change_rich_text(&mut wb, 0, addr("D1"), vec![bold_run("Overwrite")])
        .is_err());
    assert_eq!(
        wb.sheet(0).unwrap().formula_text_at(addr("D1")).as_deref(),
        Some("=COUNTA(Sales[Item])")
    );

    // Enable totals row, add rich text to A4 ("Total"), then change Item total function to Count:
    // A4 becomes =SUBTOTAL(103,Sales[Item]) and must drop its rich text cleanly!
    hist.set_table_totals_row(&mut wb, "Sales", true).unwrap();
    let total_runs = vec![bold_run("Total")];
    hist.change_rich_text(&mut wb, 0, addr("A4"), total_runs.clone())
        .unwrap();
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A4")),
        Some(total_runs.as_slice())
    );
    hist.set_table_total_function(
        &mut wb,
        "Sales",
        "Item",
        einfach_excel_core::TotalsFunction::Count,
    )
    .unwrap();
    assert!(wb.sheet(0).unwrap().rich_text(addr("A4")).is_none());
    assert!(hist.undo(&mut wb).unwrap());
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A4")),
        Some(total_runs.as_slice())
    );

    // Appending a data row shifts A4 ("Total") rich text down to A5 cleanly
    hist.append_table_row(&mut wb, "Sales", 100).unwrap();
    assert!(wb.sheet(0).unwrap().rich_text(addr("A4")).is_none());
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A5")),
        Some(total_runs.as_slice())
    );

    // Resizing table to A1:B7 moves Totals row rich text from A5 to A7 cleanly
    hist.resize_table(&mut wb, "Sales", CellRange::new(addr("A1"), addr("B7")))
        .unwrap();
    assert!(wb.sheet(0).unwrap().rich_text(addr("A5")).is_none());
    assert_eq!(
        wb.sheet(0).unwrap().rich_text(addr("A7")),
        Some(total_runs.as_slice())
    );

    // Hiding header row clears header rich text cleanly
    let header_runs = vec![bold_run("It"), plain_run("em")];
    hist.change_rich_text(&mut wb, 0, addr("A1"), header_runs)
        .unwrap();
    hist.set_table_headers(&mut wb, "Sales", false, 100)
        .unwrap();
    assert!(wb.sheet(0).unwrap().rich_text(addr("A1")).is_none());
}
