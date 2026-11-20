use einfach_core::Value;
use einfach_excel_core::outline::{OutlineAction, OutlineAxis};
use einfach_excel_core::subtotal::{
    SubtotalAction, SubtotalCalculation, SubtotalFunction, SubtotalPlacement, SubtotalRequest,
    SubtotalSettings,
};
use einfach_excel_core::workbook_history::WorkbookHistory;
use einfach_excel_core::{CellAddress, CellRange, Workbook};

fn fixture() -> (Workbook, WorkbookHistory) {
    let mut workbook = Workbook::new();
    let report = workbook.add_sheet("Report");
    for (address, text) in [
        ("A1", "Region"),
        ("B1", "Product"),
        ("C1", "Sales"),
        ("A2", "East"),
        ("A3", "East"),
        ("A4", "West"),
        ("A5", "West"),
        ("B2", "Bags"),
        ("B3", "Pens"),
        ("B4", "Bags"),
        ("B5", "Pens"),
        ("H9", "Independent"),
    ] {
        workbook.set_cell(0, address, Value::Text(text.into()));
    }
    for (address, value) in [("C2", 2.), ("C3", 3.), ("C4", 4.), ("C5", 16.)] {
        workbook.set_cell(0, address, Value::Number(value));
    }
    assert!(workbook.set_formula(report, "A1", "=Sheet1!C4"));
    (workbook, WorkbookHistory::default())
}

fn range(text: &str) -> CellRange {
    let (start, end) = text.split_once(':').unwrap_or((text, text));
    CellRange::new(
        CellAddress::parse(start).unwrap(),
        CellAddress::parse(end).unwrap(),
    )
}

fn apply(
    group_by_column: u32,
    function: SubtotalFunction,
    placement: SubtotalPlacement,
    replace: bool,
) -> SubtotalAction {
    SubtotalAction::Apply(SubtotalSettings {
        group_by_column,
        calculation: SubtotalCalculation {
            function,
            columns: vec![2],
        },
        placement,
        replace,
        total_suffix: " Total".into(),
        grand_total: "Grand Total".into(),
    })
}

fn request(action: SubtotalAction, range_text: &str, row_count: u32) -> SubtotalRequest {
    SubtotalRequest {
        sheet: 0,
        selection: range(range_text),
        row_count,
        col_count: 12,
        action,
    }
}

fn sum_below() -> SubtotalAction {
    apply(0, SubtotalFunction::Sum, SubtotalPlacement::Below, true)
}

#[test]
fn subtotals_are_real_formulas_with_independent_outline_and_one_history_entry() {
    let (mut book, mut history) = fixture();
    let result = history
        .change_subtotals(&mut book, &request(sum_below(), "A1:C5", 60))
        .unwrap()
        .unwrap();
    assert_eq!(result.range, range("A1:C8"));
    assert_eq!(result.edits.len(), 2);
    assert_eq!(history.undo_count(), 1);
    assert_eq!(
        history.entries().next().unwrap().structural_edits(),
        result.edits
    );
    assert_eq!(history.entries().next().unwrap().affected_sheets(), [0, 1]);
    let sheet = book.sheet(0).unwrap();
    assert_eq!(
        sheet.get_formula("C4").as_deref(),
        Some("=SUBTOTAL(9,C2:C3)")
    );
    assert_eq!(
        sheet.get_formula("C8").as_deref(),
        Some("=SUBTOTAL(9,C2:C6)")
    );
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(25.));
    assert_eq!(
        book.sheet(1).unwrap().get_formula("A1").as_deref(),
        Some("=Sheet1!C5")
    );
    assert_eq!(
        book.get_cell("Sheet1", "H12"),
        Value::Text("Independent".into())
    );

    history
        .change_outline(
            &mut book,
            0,
            OutlineAxis::Row,
            OutlineAction::ShowLevel { level: 1 },
        )
        .unwrap();
    let outline = book.sheet(0).unwrap().outline();
    assert!(outline.is_hidden(OutlineAxis::Row, 1));
    assert!(!outline.is_hidden(OutlineAxis::Row, 7));
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(25.));
    assert!(history.undo(&mut book).unwrap());
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(4.));
    assert_eq!(
        book.get_cell("Sheet1", "H9"),
        Value::Text("Independent".into())
    );
    assert!(book.subtotal_regions(0).unwrap().is_empty());
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "C8"), Value::Number(25.));
}

#[test]
fn append_keeps_references_to_existing_summary_rows_and_removal_is_atomic() {
    let (mut book, mut history) = fixture();
    history
        .change_subtotals(&mut book, &request(sum_below(), "A1:C5", 60))
        .unwrap();
    assert!(book.set_formula(1, "A2", "=Sheet1!C4"));
    let append = apply(1, SubtotalFunction::Count, SubtotalPlacement::Below, false);
    let result = history
        .change_subtotals(&mut book, &request(append, "A1", 63))
        .unwrap()
        .unwrap();
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(5.));
    assert_eq!(
        book.get_cell("Sheet1", &format!("C{}", result.range.end.row)),
        Value::Number(25.)
    );
    assert_eq!(
        book.get_cell("Sheet1", &format!("C{}", result.range.end.row + 1)),
        Value::Number(4.)
    );

    let summary = book.sheet(1).unwrap().get_formula("A2").unwrap();
    let row = summary.rsplit_once('C').unwrap().1.parse::<u32>().unwrap();
    let foreign = format!("H{row}");
    book.set_cell(0, &foreign, Value::Text("Manual edit".into()));
    let removal = request(SubtotalAction::Remove, "A1", result.range.end.row + 60);
    assert!(history.change_subtotals(&mut book, &removal).is_err());
    assert_eq!(
        book.get_cell("Sheet1", &foreign),
        Value::Text("Manual edit".into())
    );
    assert_eq!(history.undo_count(), 2);
    book.clear_cell(0, &foreign);
    assert!(history
        .change_subtotals(&mut book, &removal)
        .unwrap()
        .is_some());
    assert!(book.subtotal_regions(0).unwrap().is_empty());
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(4.));
    assert!(history.undo(&mut book).unwrap());
    assert_eq!(book.get_cell("Report", "A2"), Value::Number(5.));
}

#[test]
fn above_placement_metadata_follows_inserted_rows_and_survives_a_round_trip() {
    let (mut book, mut history) = fixture();
    let above = apply(0, SubtotalFunction::Average, SubtotalPlacement::Above, true);
    history
        .change_subtotals(&mut book, &request(above, "A1:C5", 60))
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "C2"), Value::Number(6.25));
    assert!(book
        .sheet(0)
        .unwrap()
        .outline()
        .rows
        .iter()
        .all(|g| g.subtotal.unwrap().summary_above));
    history
        .edit_structure(
            &mut book,
            0,
            einfach_excel_core::shift::ShiftEdit::RowInsert { at: 0, count: 1 },
        )
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "C3"), Value::Number(6.25));
    let regions = book.subtotal_regions(0).unwrap().to_vec();
    let encoded = serde_json::to_string(&regions).unwrap();
    book.restore_subtotal_regions(0, serde_json::from_str(&encoded).unwrap())
        .unwrap();
    let remove = request(SubtotalAction::Remove, "A2", 64);
    assert!(history
        .change_subtotals(&mut book, &remove)
        .unwrap()
        .is_some());
    assert_eq!(book.get_cell("Sheet1", "A3"), Value::Text("East".into()));
    assert!(book.sheet(0).unwrap().outline().rows.is_empty());
}

#[test]
fn a_late_table_conflict_rolls_back_rows_and_preserves_redo() {
    use einfach_excel_core::workbook::{TableEntry, TableRegistrySnapshot};
    let (mut book, mut history) = fixture();
    book.restore_tables(TableRegistrySnapshot::from_entries(vec![
        TableEntry::from_parts(
            "Neighbor",
            "Sheet1",
            range("I3:J4"),
            false,
            false,
            vec!["Item".into(), "Qty".into()],
        ),
    ]))
    .unwrap();
    history
        .set_cell_input(&mut book, 0, "D2", "Redo me")
        .unwrap();
    assert!(history.undo(&mut book).unwrap());

    let outcome = history.change_subtotals(&mut book, &request(sum_below(), "A1:C5", 60));
    assert!(outcome.unwrap_err().contains("existing Table"));
    assert_eq!(history.undo_count(), 0);
    assert_eq!(history.redo_count(), 1);
    assert_eq!(
        book.get_cell("Sheet1", "H9"),
        Value::Text("Independent".into())
    );
    assert_eq!(
        book.sheet(1).unwrap().get_formula("A1").as_deref(),
        Some("=Sheet1!C4")
    );
    assert_eq!(book.get_table("Neighbor").unwrap().range(), range("I3:J4"));
    assert!(book.sheet(0).unwrap().outline().rows.is_empty());
    assert!(history.redo(&mut book).unwrap());
    assert_eq!(book.get_cell("Sheet1", "D2"), Value::Text("Redo me".into()));
}

#[test]
fn deleting_an_input_heading_does_not_prevent_removing_owned_rows() {
    let (mut book, mut history) = fixture();
    history
        .change_subtotals(&mut book, &request(sum_below(), "A1:C5", 60))
        .unwrap();
    book.clear_cell(0, "B1");
    let list = book.inspect_subtotal_list(0, range("A1"), 63, 12).unwrap();
    assert!(list.fields.is_empty() && list.notice.is_some() && list.placement.is_some());
    history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove, "A1", 63))
        .unwrap()
        .unwrap();
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(4.));
    assert_eq!(book.get_cell("Sheet1", "B1"), Value::Null);
}

#[test]
fn formatting_owned_subtotal_cells_and_outer_layer_append_succeed() {
    let (mut book, mut history) = fixture();
    book.set_cell(0, "D1", Value::Text("Channel".into()));
    for (addr, ch) in [("D2", "Web"), ("D3", "Web"), ("D4", "Retail"), ("D5", "Retail")] {
        book.set_cell(0, addr, Value::Text(ch.into()));
    }
    history
        .change_subtotals(&mut book, &request(sum_below(), "A1:D5", 60))
        .unwrap();
    // Apply number format + row height to owned subtotal row 4 (row index 3): removal/append stays allowed.
    book.sheet_mut(0).unwrap().patch_format_range(
        range("C4:C4"),
        einfach_excel_core::StyleScope::Cell,
        einfach_excel_core::CellStyle {
            number_format: Some(einfach_excel_core::NumberFormat::Percent { digits: 1 }),
            ..Default::default()
        },
    );
    book.sheet_mut(0).unwrap().set_row_height(3, 30);
    // Append layer 1 (Product, Average) then layer 2 (Channel, Count), then outer layer 0 (Region, Count).
    let avg_b = apply(1, SubtotalFunction::Average, SubtotalPlacement::Below, false);
    let cnt_d = apply(3, SubtotalFunction::Count, SubtotalPlacement::Below, false);
    let cnt_a = apply(0, SubtotalFunction::Count, SubtotalPlacement::Below, false);
    history
        .change_subtotals(&mut book, &request(avg_b, "A1", 63))
        .unwrap()
        .unwrap();
    history
        .change_subtotals(&mut book, &request(cnt_d, "A1", 70))
        .unwrap()
        .unwrap();
    history
        .change_subtotals(&mut book, &request(cnt_a, "A1", 80))
        .unwrap()
        .unwrap();
    // Removing all subtotals restores the original list cleanly even after owned-cell formatting.
    history
        .change_subtotals(&mut book, &request(SubtotalAction::Remove, "A1", 90))
        .unwrap()
        .unwrap();
    assert!(book.subtotal_regions(0).unwrap().is_empty());
    assert_eq!(book.get_cell("Sheet1", "C4"), Value::Number(4.));
}

#[test]
fn deleting_one_summary_row_prunes_its_outline_and_cell_shift_rejects_subtotal_list() {
    use einfach_excel_core::shift::ShiftEdit;
    let (mut book, mut history) = fixture();
    history
        .change_subtotals(&mut book, &request(sum_below(), "A1:C5", 60))
        .unwrap();
    // Cell shift inside the subtotal region is rejected cleanly.
    assert!(history
        .shift_cells(
            &mut book,
            0,
            range("B2:B2"),
            einfach_excel_core::workbook::CellShiftDirection::InsertDown,
        )
        .is_err());
    let before_outlines = book.sheet(0).unwrap().outline().rows.len();
    // Delete East Total (row index 3); its outline group must also be pruned.
    history
        .edit_structure(&mut book, 0, ShiftEdit::RowDelete { at: 3, count: 1 })
        .unwrap();
    assert_eq!(
        book.sheet(0).unwrap().outline().rows.len(),
        before_outlines - 1
    );
}
