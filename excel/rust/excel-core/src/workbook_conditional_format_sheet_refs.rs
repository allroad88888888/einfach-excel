//! 条件公式的工作表引用随动；历史以稳定 sheet key 保存被改写的规则目录。
use super::*;

pub(super) type ConditionalRuleSources = Vec<(u64, Vec<ConditionalFormatRuleEntry>)>;

impl Workbook {
    pub(super) fn conditional_sheet_ref_rewrites(
        &self,
        old: &str,
        new: Option<&str>,
    ) -> ConditionalRuleSources {
        self.conditional_formats
            .iter()
            .enumerate()
            .filter_map(|(sheet, config)| {
                let mut rules = config.rules.clone();
                for entry in &mut rules {
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
                    let before = expr.clone();
                    rewrite_sheet_refs(&mut expr, old, new);
                    if before != expr {
                        json["formula"] = serde_json::Value::String(crate::render_formula(&expr));
                        entry.rule_json = json.to_string();
                    }
                }
                (rules != config.rules).then_some((self.sheet_keys[sheet], rules))
            })
            .collect()
    }

    pub(super) fn capture_conditional_rule_sources(
        &self,
        keys: &BTreeSet<u64>,
    ) -> ConditionalRuleSources {
        self.sheet_keys
            .iter()
            .enumerate()
            .filter(|(_, key)| keys.contains(key))
            .map(|(sheet, key)| (*key, self.conditional_formats[sheet].rules.clone()))
            .collect()
    }

    /// 所有目录的修订号先检查完，才能写入拓扑或任何一个规则。
    pub(super) fn validate_conditional_rule_sources(
        &self,
        sources: &ConditionalRuleSources,
    ) -> Result<(), &'static str> {
        for (key, rules) in sources {
            let sheet = self
                .sheet_keys
                .iter()
                .position(|current| current == key)
                .ok_or("The worksheet changed outside history.")?;
            let config = &self.conditional_formats[sheet];
            if config.rules != *rules && config.revision == u64::MAX {
                return Err("Conditional-format revision is exhausted.");
            }
        }
        Ok(())
    }

    pub(super) fn apply_conditional_rule_sources(&mut self, sources: &ConditionalRuleSources) {
        for (key, rules) in sources {
            let sheet = self
                .sheet_keys
                .iter()
                .position(|current| current == key)
                .expect("conditional-rule preflight checked sheet identity");
            self.replace_conditional_format_rules(sheet, rules.clone())
                .expect("conditional-rule preflight checked revision");
        }
    }
}
