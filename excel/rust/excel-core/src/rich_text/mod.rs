//! Inline text formatting is content metadata, independent of cell-wide formatting.
use crate::{CellAddress, CellRange, Sheet};
use einfach_core::Value;
use serde::{Deserialize, Serialize};

mod rebase;
mod format;

#[derive(Clone, Debug, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct RichTextFormat {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub bold: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub italic: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub underline: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub strikethrough: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_family: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub font_size: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct RichTextRun {
    pub text: String,
    #[serde(default)]
    pub format: RichTextFormat,
}

pub fn normalize_runs(runs: Vec<RichTextRun>) -> Result<Vec<RichTextRun>, &'static str> {
    if runs.len() > 1024 || runs.iter().map(|r| r.text.chars().count()).sum::<usize>() > 32767 {
        return Err("Rich text exceeds the cell size limit.");
    }
    let mut result: Vec<RichTextRun> = Vec::new();
    for mut run in runs {
        if run.text.contains('\0') || run.format.font_size.is_some_and(|s| !s.is_finite() || !(1.0..=512.0).contains(&s))
            || run.format.font_family.as_ref().is_some_and(|s| s.is_empty() || s.len() > 128 || s.chars().any(char::is_control)) {
            return Err("Invalid rich text format.");
        }
        if let Some(color) = &mut run.format.color {
            if color.len() != 7 || !color.starts_with('#') || !color[1..].bytes().all(|b| b.is_ascii_hexdigit()) {
                return Err("Rich text colors must use #RRGGBB.");
            }
            color.make_ascii_uppercase();
        }
        if run.text.is_empty() { continue; }
        if let Some(last) = result.last_mut().filter(|last| last.format == run.format) {
            last.text.push_str(&run.text);
        } else { result.push(run); }
    }
    Ok(result)
}

impl Sheet {
    pub fn rich_text(&self, addr: CellAddress) -> Option<&[RichTextRun]> {
        self.rich_text.get(&addr).map(Vec::as_slice)
    }

    pub fn rich_text_in_range(&self, range: CellRange) -> Vec<(CellAddress, Vec<RichTextRun>)> {
        if range.start == range.end {
            return self.rich_text.get(&range.start).map(|runs| vec![(range.start, runs.clone())]).unwrap_or_default();
        }
        let mut entries: Vec<_> = self.rich_text.iter().filter(|(addr, _)| range.contains(**addr))
            .map(|(addr, runs)| (*addr, runs.clone())).collect();
        entries.sort_by_key(|(addr, _)| (addr.row, addr.col));
        entries
    }

    /// Restore only matching literal content; reject corrupt or formula-owned runs.
    pub fn set_rich_text(&mut self, addr: CellAddress, runs: Vec<RichTextRun>) -> Result<(), &'static str> {
        let runs = normalize_runs(runs)?;
        let text: String = runs.iter().map(|run| run.text.as_str()).collect();
        if addr.row >= crate::sheet::EXCEL_MAX_ROWS || addr.col >= crate::sheet::EXCEL_MAX_COLS
            || self.formula_text_at(addr).is_some()
            || self.spill_anchor_for(addr).is_some_and(|anchor| anchor != addr)
            || (!text.is_empty() && self.peek_value(addr) != Value::Text(text.into())) {
            return Err("Rich text must match the cell's literal text.");
        }
        if runs.is_empty() { self.rich_text.remove(&addr); }
        else { self.rich_text.insert(addr, runs); }
        Ok(())
    }

    pub(crate) fn restore_rich_text(&mut self, range: CellRange, entries: &[(CellAddress, Vec<RichTextRun>)]) {
        if range.start == range.end { self.rich_text.remove(&range.start); }
        else { self.rich_text.retain(|addr, _| !range.contains(*addr)); }
        self.rich_text.extend(entries.iter().filter(|(_, runs)| !runs.is_empty()).cloned());
    }

    pub(crate) fn reconcile_rich_text(&mut self, addr: CellAddress, value: &Value) {
        let Some(runs) = self.rich_text.remove(&addr) else { return };
        if let Value::Text(text) = value {
            let runs = rebase::rebase(runs, text);
            if !runs.is_empty() { self.rich_text.insert(addr, runs); }
        }
    }

    pub(crate) fn rich_text_for_value(&self, addr: CellAddress, value: &Value) -> Vec<RichTextRun> {
        match (self.rich_text.get(&addr), value) {
            (Some(runs), Value::Text(text)) => rebase::rebase(runs.clone(), text),
            _ => Vec::new(),
        }
    }
}
