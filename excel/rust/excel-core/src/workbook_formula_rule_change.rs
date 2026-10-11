//! 公式改写历史只保留确实变化的条件规则；不回滚同表的不相关规则。
use super::*;

#[derive(Debug)]
pub(super) struct FormulaRuleChange {
    pub sheet_key: u64,
    entries: Vec<(ConditionalFormatRuleEntry, ConditionalFormatRuleEntry)>,
}

impl FormulaRuleChange {
    pub fn prepare(
        workbook: &Workbook,
        rewrite: &impl Fn(usize, CellRange, &mut Expr) -> Result<bool, &'static str>,
    ) -> Result<Vec<Self>, &'static str> {
        let mut changes = Vec::new();
        for (sheet, config) in workbook.conditional_formats.iter().enumerate() {
            let mut entries = Vec::new();
            for entry in &config.rules {
                let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&entry.rule_json)
                else {
                    continue;
                };
                if json["kind"] != "formula" {
                    continue;
                }
                let Some(mut expr) = json["formula"].as_str().and_then(parse_formula) else {
                    continue;
                };
                let range = CellRange::new(
                    CellAddress::new(entry.row_start, entry.col_start),
                    CellAddress::new(entry.row_end, entry.col_end),
                );
                if !rewrite(sheet, range, &mut expr)? {
                    continue;
                }
                json["formula"] = serde_json::Value::String(crate::render_formula(&expr));
                let mut after = entry.clone();
                after.rule_json = json.to_string();
                if after != *entry {
                    entries.push((entry.clone(), after));
                }
            }
            if !entries.is_empty() {
                changes.push(Self {
                    sheet_key: workbook.sheet_keys[sheet],
                    entries,
                });
            }
        }
        Ok(changes)
    }

    pub fn validate(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        let sheet = workbook
            .sheet_keys
            .iter()
            .position(|key| *key == self.sheet_key)
            .ok_or("The conditional-format worksheet changed outside history.")?;
        let config = &workbook.conditional_formats[sheet];
        if config.revision == u64::MAX {
            return Err("Conditional-format revision is exhausted.");
        }
        for (before, after) in &self.entries {
            let expected = if undo { after } else { before };
            if config.rules.iter().find(|entry| entry.id == expected.id) != Some(expected) {
                return Err("A referring conditional formula changed outside history.");
            }
        }
        Ok(())
    }

    pub fn apply(&self, workbook: &mut Workbook, undo: bool) {
        let sheet = workbook
            .sheet_keys
            .iter()
            .position(|key| *key == self.sheet_key)
            .expect("named-rule preflight checked worksheet identity");
        let mut rules = workbook.conditional_formats[sheet].rules.clone();
        for (before, after) in &self.entries {
            let next = if undo { before } else { after };
            *rules
                .iter_mut()
                .find(|entry| entry.id == next.id)
                .expect("named-rule preflight checked rule identity") = next.clone();
        }
        workbook
            .replace_conditional_format_rules(sheet, rules)
            .expect("named-rule preflight checked revision");
    }
}
