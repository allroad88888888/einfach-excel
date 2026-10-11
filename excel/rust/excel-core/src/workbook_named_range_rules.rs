//! 名称历史只保留确实改写的条件规则；不回滚同表的不相关规则。
use super::*;

#[derive(Debug)]
pub(super) struct NamedRangeRuleChange {
    pub sheet_key: u64,
    entries: Vec<(ConditionalFormatRuleEntry, ConditionalFormatRuleEntry)>,
}

impl NamedRangeRuleChange {
    pub fn prepare(workbook: &Workbook, old: &str, new: &str) -> Vec<Self> {
        workbook
            .conditional_formats
            .iter()
            .enumerate()
            .filter_map(|(sheet, config)| {
                let entries: Vec<_> = config
                    .rules
                    .iter()
                    .filter_map(|entry| {
                        let mut json =
                            serde_json::from_str::<serde_json::Value>(&entry.rule_json).ok()?;
                        if json["kind"] != "formula" {
                            return None;
                        }
                        let mut expr = json["formula"].as_str().and_then(parse_formula)?;
                        if !crate::shift::rename_named_reference(&mut expr, old, new) {
                            return None;
                        }
                        json["formula"] = serde_json::Value::String(crate::render_formula(&expr));
                        let mut after = entry.clone();
                        after.rule_json = json.to_string();
                        (after != *entry).then_some((entry.clone(), after))
                    })
                    .collect();
                (!entries.is_empty()).then_some(Self {
                    sheet_key: workbook.sheet_keys[sheet],
                    entries,
                })
            })
            .collect()
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
