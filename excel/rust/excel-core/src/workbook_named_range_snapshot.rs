//! 命名区域的可移植快照；表索引在恢复时重新绑定到目标工作簿的稳定身份。
use super::*;

#[derive(Clone, Debug, PartialEq)]
pub struct NamedRangeSnapshot {
    pub name: String,
    /// `None` 表示工作簿级；`Some(sheet_index)` 表示工作表级。
    pub scope: Option<usize>,
    /// None 是已有的 #REF! 定义（当 `formula` 为 `None` 时），不是缺省范围，也不能绑定新建的同名表。
    pub target: Option<(usize, CellRange)>,
    /// `Some(formula)` 表示命名公式（如 `=SUM(Sheet1!$A$1:$A$10)*1.1`）。
    pub formula: Option<String>,
}

impl Workbook {
    /// 纯元数据读取，不求值、不物化范围内的 cell atom。
    pub fn snapshot_named_ranges(&self) -> Vec<NamedRangeSnapshot> {
        let mut out: Vec<NamedRangeSnapshot> = self
            .named_values
            .values()
            .filter_map(|entry| Self::snapshot_entry(self, None, entry))
            .collect();
        for (scope_idx, &sk) in self.sheet_keys.iter().enumerate() {
            for ((entry_sk, _), entry) in &self.sheet_named_values {
                if *entry_sk == sk {
                    if let Some(snap) = Self::snapshot_entry(self, Some(scope_idx), entry) {
                        out.push(snap);
                    }
                }
            }
        }
        out
    }

    fn snapshot_entry(&self, scope: Option<usize>, entry: &NamedEntry) -> Option<NamedRangeSnapshot> {
        match &entry.definition {
            NamedDefinition::Range { sheet_key, range } => {
                let sheet = self.sheet_keys.iter().position(|key| key == sheet_key);
                Some(NamedRangeSnapshot {
                    name: entry.canonical_name.clone(),
                    scope,
                    target: sheet.zip(*range),
                    formula: None,
                })
            }
            NamedDefinition::Formula { source, .. } => Some(NamedRangeSnapshot {
                name: entry.canonical_name.clone(),
                scope,
                target: None,
                formula: Some(source.clone()),
            }),
            NamedDefinition::Value(_) | NamedDefinition::CustomFormula(_) => None,
        }
    }

    /// 整体替换范围与命名公式定义；常量／LAMBDA 名称不属于此快照，不被删除或覆盖。
    pub fn restore_named_ranges(
        &mut self,
        entries: Vec<NamedRangeSnapshot>,
    ) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        self.ensure_workbook_unprotected().map_err(|_| WorkbookError::ProtectedWorkbook)?;
        let mut next_global = BTreeMap::new();
        let mut next_scoped = BTreeMap::new();
        for entry in entries {
            let key = self.validate_named_range_name(&entry.name)?;
            let scope_key = match entry.scope {
                None => None,
                Some(scope_idx) => Some(
                    self.sheet_key(scope_idx)
                        .ok_or(WorkbookError::EvalFailed(ValueError::InvalidRef))?,
                ),
            };
            if self
                .named_values
                .get(&key)
                .is_some_and(|existing| matches!(existing.definition, NamedDefinition::CustomFormula(_)))
            {
                return Err(WorkbookError::NameConflict);
            }
            if scope_key.is_none()
                && (next_global.contains_key(&key)
                    || self.named_values.get(&key).is_some_and(|existing| {
                        matches!(
                            existing.definition,
                            NamedDefinition::Value(_) | NamedDefinition::CustomFormula(_)
                        )
                    }))
            {
                return Err(WorkbookError::NameConflict);
            }
            if let Some(sk) = scope_key {
                if next_scoped.contains_key(&(sk, key.clone())) {
                    return Err(WorkbookError::NameConflict);
                }
            }
            let definition = if let Some(formula) = entry.formula {
                let (source, expr) =
                    Self::parse_named_formula_source(&formula, true).ok_or(WorkbookError::ParseFailed)?;
                NamedDefinition::Formula { source, expr }
            } else {
                match entry.target {
                    Some((sheet, range)) => self.named_range_definition(sheet, range)?,
                    // 工作表 key 从 1 分配。0 表示无来源；None 范围永久保持 #REF!。
                    None => NamedDefinition::Range {
                        sheet_key: 0,
                        range: None,
                    },
                }
            };
            let named_entry = NamedEntry {
                canonical_name: entry.name,
                definition,
            };
            match scope_key {
                None => {
                    next_global.insert(key, named_entry);
                }
                Some(sk) => {
                    next_scoped.insert((sk, key), named_entry);
                }
            }
        }
        // 所有校验已完成。订阅者只收到最终投影，不看到中途缺名或旧 spill。
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        self.named_values
            .retain(|_, entry| matches!(entry.definition,
                NamedDefinition::Value(_) | NamedDefinition::CustomFormula(_)));
        self.named_values.extend(next_global);
        self.sheet_named_values = next_scoped;
        self.sync_atom_names();
        for (sheet, observers) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observers);
        }
        Ok(())
    }
}
