//! 条件格式 CRUD 的原生历史；只保存规则元数据，不保存范围内的 cellStyle。
use super::*;
use crate::workbook::conditional_format_numeric::NumericRule;
use crate::workbook::{ConditionalFormatConfigSnapshot, ConditionalFormatRuleEntry};
use crate::CellAddress;

#[derive(Debug)]
pub(super) struct ConditionalFormatChange {
    before: Vec<ConditionalFormatRuleEntry>,
    after: Vec<ConditionalFormatRuleEntry>,
}

impl ConditionalFormatChange {
    pub(super) fn apply(
        &self,
        workbook: &mut Workbook,
        sheet: usize,
        key: u64,
        undo: bool,
    ) -> Result<(), &'static str> {
        if workbook.is_inside_custom_call() || workbook.sheet_key(sheet) != Some(key) {
            return Err("The worksheet changed outside history.");
        }
        let expected = if undo { &self.after } else { &self.before };
        let current = workbook
            .conditional_format_config(sheet)
            .map_err(|_| "The worksheet no longer exists.")?;
        if &current.rules != expected {
            return Err("Conditional formatting changed outside history.");
        }
        workbook
            .replace_conditional_format_rules(
                sheet,
                if undo { &self.before } else { &self.after }.clone(),
            )
            .map_err(|_| "Cannot restore conditional formatting.")
    }

    pub(super) fn retained_bytes(&self) -> usize {
        self.before
            .iter()
            .chain(&self.after)
            .map(|rule| {
                std::mem::size_of::<ConditionalFormatRuleEntry>()
                    + rule.id.len()
                    + rule.rule_json.len()
            })
            .sum()
    }
}

impl WorkbookHistory {
    pub fn set_conditional_format_rule(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        revision: u64,
        rule: ConditionalFormatRuleEntry,
    ) -> Result<ConditionalFormatConfigSnapshot, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        NumericRule::parse(&rule.rule_json).map_err(str::to_owned)?;
        let before = workbook
            .conditional_format_config(sheet)
            .map_err(|error| error.to_string())?;
        let range = CellRange::new(
            CellAddress::new(rule.row_start, rule.col_start),
            CellAddress::new(rule.row_end, rule.col_end),
        );
        let label = if before.rules.iter().any(|entry| entry.id == rule.id) {
            "Edit conditional format"
        } else {
            "Add conditional format"
        };
        let after = workbook
            .set_conditional_format_rule(sheet, revision, rule)
            .map_err(|error| error.to_string())?;
        self.record_conditional_format(workbook, before.rules, &after, range, label);
        Ok(after)
    }

    pub fn remove_conditional_format_rule(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        revision: u64,
        id: &str,
    ) -> Result<ConditionalFormatConfigSnapshot, String> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let before = workbook
            .conditional_format_config(sheet)
            .map_err(|error| error.to_string())?;
        let rule = before
            .rules
            .iter()
            .find(|entry| entry.id == id)
            .ok_or("The conditional format no longer exists.")?;
        let range = CellRange::new(
            CellAddress::new(rule.row_start, rule.col_start),
            CellAddress::new(rule.row_end, rule.col_end),
        );
        let after = workbook
            .remove_conditional_format_rule(sheet, revision, id)
            .map_err(|error| error.to_string())?;
        self.record_conditional_format(
            workbook,
            before.rules,
            &after,
            range,
            "Remove conditional format",
        );
        Ok(after)
    }

    fn record_conditional_format(
        &mut self,
        workbook: &Workbook,
        before: Vec<ConditionalFormatRuleEntry>,
        after: &ConditionalFormatConfigSnapshot,
        range: CellRange,
        label: &str,
    ) {
        if before == after.rules {
            return;
        }
        let sheet = after.sheet;
        let key = workbook.sheet_key(sheet).unwrap();
        self.push(HistoryEntry {
            label: label.to_owned(),
            sheet,
            range,
            sheet_key: key,
            sheet_name: workbook.name(sheet).unwrap().to_owned(),
            affected_keys: vec![key],
            affected_indices: vec![sheet],
            origin: Rc::downgrade(&workbook.atom_context),
            change: HistoryChange::ConditionalFormat(ConditionalFormatChange {
                before,
                after: after.rules.clone(),
            }),
        });
    }
}
