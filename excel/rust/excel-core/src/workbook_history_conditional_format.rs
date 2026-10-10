//! 条件格式 CRUD 的原生历史；只保存规则元数据，不保存范围内的 cellStyle。
use super::*;
use crate::workbook::conditional_format_rule::NativeRule;
use crate::workbook::{
    ConditionalFormatConfigSnapshot, ConditionalFormatRuleAction, ConditionalFormatRuleEntry,
};
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
    /// 只编辑一份规则目录；重排不拆成多次写入，溢出与旧修订号在写入前拒绝。
    pub fn manage_conditional_format_rule(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        revision: u64,
        id: &str,
        action: ConditionalFormatRuleAction,
    ) -> Result<ConditionalFormatConfigSnapshot, String> {
        use ConditionalFormatRuleAction::*;
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.".into());
        }
        let before = workbook
            .conditional_format_config(sheet)
            .map_err(|error| error.to_string())?;
        if before.revision != revision {
            return Err(
                "The conditional-format rules changed. Reopen the panel and try again.".into(),
            );
        }
        let mut rules = before.rules.clone();
        // 与显示投影相同：较小优先级优先，同值保留原列表顺序。
        rules.sort_by_key(|rule| rule.priority);
        let index = rules
            .iter()
            .position(|rule| rule.id == id)
            .ok_or("The conditional format no longer exists.")?;
        let mut range = CellRange::new(
            CellAddress::new(rules[index].row_start, rules[index].col_start),
            CellAddress::new(rules[index].row_end, rules[index].col_end),
        );
        let label = match action {
            Duplicate => {
                NativeRule::parse(&rules[index].rule_json)?;
                let mut copy = rules[index].clone();
                let mut suffix = rules.len() + 1;
                loop {
                    copy.id = format!("conditional-format-{suffix}");
                    if !rules.iter().any(|rule| rule.id == copy.id) {
                        break;
                    }
                    suffix += 1;
                }
                rules.insert(index + 1, copy);
                "Copy conditional format"
            }
            Enable | Disable => {
                let enabled = matches!(action, Enable);
                if NativeRule::parse(&rules[index].rule_json)?.enabled() == enabled {
                    return Ok(before);
                }
                let mut json: serde_json::Value = serde_json::from_str(&rules[index].rule_json)
                    .map_err(|_| "The stored rule is invalid.")?;
                json["enabled"] = serde_json::Value::Bool(enabled);
                rules[index].rule_json = json.to_string();
                if enabled {
                    "Enable conditional format"
                } else {
                    "Disable conditional format"
                }
            }
            MoveUp | MoveDown => {
                let target = if matches!(action, MoveUp) {
                    index.checked_sub(1)
                } else {
                    (index + 1 < rules.len()).then_some(index + 1)
                };
                let Some(target) = target else {
                    return Ok(before);
                };
                let other = &rules[target];
                range = CellRange::new(
                    CellAddress::new(
                        range.start.row.min(other.row_start),
                        range.start.col.min(other.col_start),
                    ),
                    CellAddress::new(
                        range.end.row.max(other.row_end),
                        range.end.col.max(other.col_end),
                    ),
                );
                rules.swap(index, target);
                "Reorder conditional formats"
            }
        };
        if matches!(action, Duplicate | MoveUp | MoveDown) {
            // 包含相同优先级及 i64 极值的旧目录也能重排；不对旧值做 +/- 1。
            for (priority, rule) in rules.iter_mut().enumerate() {
                rule.priority =
                    i64::try_from(priority).map_err(|_| "Too many conditional-format rules.")?;
            }
        }
        workbook
            .replace_conditional_format_rules(sheet, rules)
            .map_err(|error| error.to_string())?;
        let after = workbook
            .conditional_format_config(sheet)
            .map_err(|error| error.to_string())?;
        self.record_conditional_format(workbook, before.rules, &after, range, label);
        Ok(after)
    }

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
        NativeRule::parse(&rule.rule_json).map_err(str::to_owned)?;
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
