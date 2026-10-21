//! 拓扑历史复用既有 sheet-reference AST 重写；快照只持有实际变化的验证目录。
use super::*;
use crate::data_validation::DataValidationRegion;
use crate::workbook::workbook_sheet_refs::rewrite_sheet_refs;

pub(crate) type ValidationRuleSources = Vec<(u64, Vec<DataValidationRegion>)>;

impl Workbook {
    pub(crate) fn validation_sheet_ref_rewrites(
        &self,
        old: &str,
        new: Option<&str>,
    ) -> ValidationRuleSources {
        self.sheets
            .iter()
            .enumerate()
            .filter_map(|(owner, sheet)| {
                let mut regions = sheet.data_validations.clone();
                let mut changed = false;
                for entry in &mut regions {
                    let DataValidationKind::CustomFormula { formula, .. } = &entry.rule.kind else {
                        continue;
                    };
                    let Some(mut expression) = parse_formula(formula) else {
                        continue;
                    };
                    let before = expression.clone();
                    rewrite_sheet_refs(&mut expression, old, new);
                    if expression != before {
                        if let DataValidationKind::CustomFormula { formula, .. } =
                            &mut Arc::make_mut(&mut entry.rule).kind
                        {
                            *formula = crate::render_formula(&expression);
                        }
                        changed = true;
                    }
                }
                changed.then_some((self.sheet_keys[owner], regions))
            })
            .collect()
    }

    pub(crate) fn capture_validation_rule_sources(
        &self,
        keys: &BTreeSet<u64>,
    ) -> ValidationRuleSources {
        self.sheet_keys
            .iter()
            .enumerate()
            .filter(|(_, key)| keys.contains(key))
            .map(|(owner, key)| (*key, self.sheets[owner].data_validations.clone()))
            .collect()
    }

    pub(crate) fn validate_validation_rule_sources(
        &self,
        sources: &ValidationRuleSources,
    ) -> Result<(), &'static str> {
        for (key, regions) in sources {
            if !self.sheet_keys.contains(key) {
                return Err("The worksheet changed outside history.");
            }
            for entry in regions {
                entry.rule.validate_definition()?;
            }
        }
        Ok(())
    }

    /// 调用方已在任何拓扑/目录写入前完成所有 owner 的预检。
    pub(crate) fn apply_validation_rule_sources(&mut self, sources: &ValidationRuleSources) {
        for (key, regions) in sources {
            let owner = self
                .sheet_keys
                .iter()
                .position(|current| current == key)
                .expect("validation-rule preflight checked sheet identity");
            self.sheets[owner].data_validations = regions.clone();
        }
    }
}
