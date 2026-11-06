use super::*;
use crate::rich_text::{normalize_runs, RichTextRun};
use einfach_core::Value;

impl WorkbookHistory {
    pub fn change_rich_text(&mut self, workbook: &mut Workbook, sheet: usize,
        addr: crate::CellAddress, runs: Vec<RichTextRun>) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() { return Err("Another history command is pending."); }
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range)?;
        let runs = normalize_runs(runs)?;
        let target = workbook.sheet(sheet).unwrap();
        if target.spill_anchor_for(addr).is_some_and(|anchor| anchor != addr)
            || target.merged_range_at(addr).is_some_and(|range| range.start != addr) {
            return Err("Select the anchor cell before editing rich text.");
        }
        if workbook.list_tables().iter().any(|entry| Some(entry.sheet_name()) == workbook.name(sheet) && entry.range().contains(addr)) {
            return Err("Rich text editing is unavailable inside a table.");
        }
        let text: String = runs.iter().map(|run| run.text.as_str()).collect();
        let value = if text.is_empty() { Value::Null } else { Value::Text(text.into()) };
        if target.formula_text_at(addr).is_none() && target.peek_value(addr) == value
            && target.rich_text(addr).unwrap_or_default() == runs { return Ok(false); }
        self.begin(workbook, sheet, range, "Edit rich text", true)?;
        let store = workbook.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = workbook.apply_validated_input(sheet, addr, |book| {
                book.try_set_cell(sheet, &addr.to_string(), value).map_err(|_| "Could not update rich text.")?;
                book.sheet_mut(sheet).unwrap().set_rich_text(addr, runs)
            });
            if let Err(error) = self.finish(workbook, result.is_ok()) { result = Err(error); }
        });
        result.map(|()| true)
    }
}
