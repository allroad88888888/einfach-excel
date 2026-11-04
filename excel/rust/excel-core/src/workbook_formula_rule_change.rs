//! 公式改写历史只保留确实变化的条件格式与数据验证规则；不回滚同表的不相关规则。
use super::*;
use crate::data_validation::{DataValidationKind, DataValidationRegion};

#[path = "workbook_conditional_format_row_band.rs"]
mod row_band;

#[derive(Debug)]
pub(super) struct FormulaRuleChange {
    pub sheet_key: u64,
    entries: Vec<(ConditionalFormatRuleEntry, ConditionalFormatRuleEntry)>,
    /// 自定义公式验证规则的前后像；区域不变，只改写公式。
    validations: Vec<(DataValidationRegion, DataValidationRegion)>,
}

impl FormulaRuleChange {
    pub fn prepare(
        workbook: &Workbook,
        rewrite: &impl Fn(usize, CellRange, &mut Expr) -> bool,
    ) -> Vec<Self> {
        Self::prepare_except(workbook, rewrite, None)
    }

    /// `own_validations` 的验证规则由调用者随区域位移一并改写，这里跳过以免重复。
    pub(super) fn prepare_except(
        workbook: &Workbook,
        rewrite: &impl Fn(usize, CellRange, &mut Expr) -> bool,
        own_validations: Option<usize>,
    ) -> Vec<Self> {
        let mut changes = Vec::new();
        for (sheet, config) in workbook.conditional_formats.iter().enumerate() {
            let mut entries = Vec::new();
            for entry in &config.rules {
                let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&entry.rule_json)
                else {
                    continue;
                };
                let range = CellRange::new(
                    CellAddress::new(entry.row_start, entry.col_start),
                    CellAddress::new(entry.row_end, entry.col_end),
                );
                if !advanced_conditional_format::rewrite_rule_formulas(&mut json, |source| {
                    let mut expr = parse_formula(source)?;
                    rewrite(sheet, range, &mut expr).then(|| crate::render_formula(&expr))
                }) {
                    continue;
                }
                let mut after = entry.clone();
                after.rule_json = json.to_string();
                if after != *entry {
                    entries.push((entry.clone(), after));
                }
            }
            let validations = if own_validations == Some(sheet) { Vec::new() } else {
                rewritten_validations(&workbook.sheets[sheet], &|range, expr| rewrite(sheet, range, expr))
            };
            if !entries.is_empty() || !validations.is_empty() {
                changes.push(Self {
                    sheet_key: workbook.sheet_keys[sheet],
                    entries,
                    validations,
                });
            }
        }
        changes
    }

    /// 由改写前的目录与当前目录得出变化（结构编辑在原生位移后调用）；规则只改公式，不移动区域。
    pub(super) fn between(
        workbook: &Workbook,
        sheet: usize,
        rules: &[ConditionalFormatRuleEntry],
        validations: &[DataValidationRegion],
    ) -> Option<Self> {
        let entries: Vec<_> = rules.iter().filter_map(|before| {
            let after = workbook.conditional_formats[sheet].rules.iter()
                .find(|entry| entry.id == before.id)?;
            (after != before).then(|| (before.clone(), after.clone()))
        }).collect();
        let current = workbook.sheets[sheet].data_validations();
        let validations: Vec<_> = if current.len() == validations.len() {
            validations.iter().zip(current)
                .filter(|(before, after)| before != after)
                .map(|(before, after)| (before.clone(), after.clone())).collect()
        } else { Vec::new() };
        (!entries.is_empty() || !validations.is_empty())
            .then(|| Self { sheet_key: workbook.sheet_keys[sheet], entries, validations })
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
        let regions = workbook.sheets[sheet].data_validations();
        for (before, after) in &self.validations {
            if !regions.contains(if undo { after } else { before }) {
                return Err("A referring validation formula changed outside history.");
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
        if !self.validations.is_empty() {
            let regions = &mut workbook.sheets[sheet].data_validations;
            for (before, after) in &self.validations {
                let (expected, next) = if undo { (after, before) } else { (before, after) };
                *regions.iter_mut().find(|region| *region == expected)
                    .expect("named-rule preflight checked validation identity") = next.clone();
            }
        }
        if self.entries.is_empty() { return; }
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

/// 自定义公式验证规则按回调改写；相对引用以规则锚点为基准，与公式所在区域无关。
fn rewritten_validations(
    sheet: &crate::sheet::Sheet,
    rewrite: &impl Fn(CellRange, &mut Expr) -> bool,
) -> Vec<(DataValidationRegion, DataValidationRegion)> {
    sheet.data_validations().iter().filter_map(|region| {
        let DataValidationKind::CustomFormula { formula, .. } = &region.rule.kind else { return None };
        let mut expr = parse_formula(formula)?;
        if !rewrite(region.range, &mut expr) { return None; }
        let next = crate::render_formula(&expr);
        if next == *formula { return None; }
        let mut after = region.clone();
        if let DataValidationKind::CustomFormula { formula, .. } = &mut Arc::make_mut(&mut after.rule).kind {
            *formula = next;
        }
        Some((region.clone(), after))
    }).collect()
}
