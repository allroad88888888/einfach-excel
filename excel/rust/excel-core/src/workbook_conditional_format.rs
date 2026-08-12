//! Workbook operations for per-sheet conditional-format configuration.

use std::collections::HashSet;

use super::workbook_conditional_format_types::SheetConditionalFormatConfig;
use super::*;

impl Workbook {
    pub fn conditional_format_config(
        &self,
        sheet: usize,
    ) -> Result<ConditionalFormatConfigSnapshot, ConditionalFormatError> {
        let config = self
            .conditional_formats
            .get(sheet)
            .ok_or(ConditionalFormatError::UnknownSheet)?;
        Ok(ConditionalFormatConfigSnapshot {
            sheet,
            revision: config.revision,
            rules: config.rules.clone(),
        })
    }

    pub fn set_conditional_format_rule(
        &mut self,
        sheet: usize,
        expected_revision: u64,
        rule: ConditionalFormatRuleEntry,
    ) -> Result<ConditionalFormatConfigSnapshot, ConditionalFormatError> {
        if self.is_inside_custom_call() {
            return Err(ConditionalFormatError::MutationDuringCustomCall);
        }
        validate_conditional_format_rule(&rule)?;
        let config = self
            .conditional_formats
            .get_mut(sheet)
            .ok_or(ConditionalFormatError::UnknownSheet)?;
        assert_conditional_format_revision(config.revision, expected_revision)?;
        if let Some(index) = config.rules.iter().position(|item| item.id == rule.id) {
            config.rules[index] = rule;
        } else {
            config.rules.push(rule);
        }
        config.revision = next_conditional_format_revision(config.revision)?;
        Ok(ConditionalFormatConfigSnapshot {
            sheet,
            revision: config.revision,
            rules: config.rules.clone(),
        })
    }

    pub fn remove_conditional_format_rule(
        &mut self,
        sheet: usize,
        expected_revision: u64,
        rule_id: &str,
    ) -> Result<ConditionalFormatConfigSnapshot, ConditionalFormatError> {
        if self.is_inside_custom_call() {
            return Err(ConditionalFormatError::MutationDuringCustomCall);
        }
        if rule_id.trim().is_empty() {
            return Err(ConditionalFormatError::InvalidRuleId);
        }
        let config = self
            .conditional_formats
            .get_mut(sheet)
            .ok_or(ConditionalFormatError::UnknownSheet)?;
        assert_conditional_format_revision(config.revision, expected_revision)?;
        config.rules.retain(|rule| rule.id != rule_id);
        config.revision = next_conditional_format_revision(config.revision)?;
        Ok(ConditionalFormatConfigSnapshot {
            sheet,
            revision: config.revision,
            rules: config.rules.clone(),
        })
    }

    pub fn snapshot_conditional_formats(&self) -> Vec<ConditionalFormatConfigSnapshot> {
        self.conditional_formats
            .iter()
            .enumerate()
            .filter(|(_, config)| config.revision > 0 || !config.rules.is_empty())
            .map(|(sheet, config)| ConditionalFormatConfigSnapshot {
                sheet,
                revision: config.revision,
                rules: config.rules.clone(),
            })
            .collect()
    }

    pub fn restore_conditional_formats(
        &mut self,
        snapshots: Vec<ConditionalFormatConfigSnapshot>,
    ) -> Result<usize, ConditionalFormatError> {
        if self.is_inside_custom_call() {
            return Err(ConditionalFormatError::MutationDuringCustomCall);
        }
        let restored_count = snapshots.len();
        let mut restored = vec![SheetConditionalFormatConfig::default(); self.sheets.len()];
        let mut seen_sheets = HashSet::new();
        for snapshot in snapshots {
            if snapshot.sheet >= restored.len() {
                return Err(ConditionalFormatError::UnknownSheet);
            }
            if !seen_sheets.insert(snapshot.sheet) {
                return Err(ConditionalFormatError::DuplicateSheetSnapshot);
            }
            validate_conditional_format_rules(&snapshot.rules)?;
            restored[snapshot.sheet] = SheetConditionalFormatConfig {
                revision: snapshot.revision,
                rules: snapshot.rules,
            };
        }
        self.conditional_formats = restored;
        Ok(restored_count)
    }
}

fn assert_conditional_format_revision(
    actual: u64,
    expected: u64,
) -> Result<(), ConditionalFormatError> {
    if actual == expected {
        Ok(())
    } else {
        Err(ConditionalFormatError::StaleRevision { expected, actual })
    }
}

fn next_conditional_format_revision(current: u64) -> Result<u64, ConditionalFormatError> {
    current
        .checked_add(1)
        .ok_or(ConditionalFormatError::RevisionExhausted)
}

fn validate_conditional_format_rule(
    rule: &ConditionalFormatRuleEntry,
) -> Result<(), ConditionalFormatError> {
    if rule.id.trim().is_empty() {
        return Err(ConditionalFormatError::InvalidRuleId);
    }
    if rule.row_end < rule.row_start || rule.col_end < rule.col_start {
        return Err(ConditionalFormatError::InvalidRuleRange);
    }
    Ok(())
}

fn validate_conditional_format_rules(
    rules: &[ConditionalFormatRuleEntry],
) -> Result<(), ConditionalFormatError> {
    let mut ids = HashSet::new();
    for rule in rules {
        validate_conditional_format_rule(rule)?;
        if !ids.insert(&rule.id) {
            return Err(ConditionalFormatError::DuplicateRuleId);
        }
    }
    Ok(())
}
