/// New inline content is preflighted before any legacy import entry can write a value.
fn validate_imported_rich_text(workbook: &Workbook, cells: &mut [WorkbookImportCellJSON]) -> Result<(), String> {
    for cell in cells {
        let Some(runs) = cell.rich_text.take() else { continue };
        let addr = CellAddress::new(cell.row, cell.col);
        let sheet = workbook.sheet(cell.sheet).ok_or("The rich text worksheet no longer exists.")?;
        if cell.row >= 1_048_576 || cell.col >= 16_384
            || sheet.merged_range_at(addr).is_some_and(|range| range.start != addr) {
            return Err("Invalid rich text import target.".into());
        }
        if !matches!(&cell.kind, BulkImportKindJSON::Text(kind) if kind == "text") {
            return Err("Imported rich text requires a literal text cell.".into());
        }
        let Some(BulkImportValueJSON::Text(text)) = &cell.value else {
            return Err("Imported rich text requires a string value.".into());
        };
        let runs = einfach_excel_core::rich_text::normalize_runs(runs)?;
        if runs.iter().map(|run| run.text.as_str()).collect::<String>() != *text {
            return Err("Rich text must match the cell's literal text.".into());
        }
        cell.rich_text = Some(runs);
    }
    Ok(())
}
