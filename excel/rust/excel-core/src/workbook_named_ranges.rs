//! 命名区域的原生定义；求值时通过稳定表身份解析当前位置。

use super::*;

impl Workbook {
    /// 注册或替换一个工作簿级范围。命令历史由调用方的原生事务负责。
    /// 与 define_name_value 共用名称空间，不能覆盖 Excel Table 的名称。
    pub fn define_named_range(
        &mut self,
        name: &str,
        sheet_index: usize,
        range: CellRange,
    ) -> Result<(), WorkbookError> {
        self.define_scoped_named_range(name, None, sheet_index, range)
    }

    pub fn define_scoped_named_range(
        &mut self,
        name: &str,
        scope_sheet: Option<usize>,
        sheet_index: usize,
        range: CellRange,
    ) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        self.ensure_workbook_unprotected().map_err(|_| WorkbookError::ProtectedWorkbook)?;
        let scope_key = match scope_sheet {
            None => None,
            Some(scope) => Some(
                self.sheet_key(scope)
                    .ok_or(WorkbookError::EvalFailed(ValueError::InvalidRef))?,
            ),
        };
        let key = self.validate_named_range_name(name)?;
        if self.named_values.get(&key)
            .is_some_and(|entry| matches!(entry.definition, NamedDefinition::CustomFormula(_))) {
            return Err(WorkbookError::NameConflict);
        }
        let definition = self.named_range_definition(sheet_index, range)?;
        self.insert_scoped_entry(
            scope_key,
            key,
            NamedEntry {
                canonical_name: name.into(),
                definition,
            },
        );
        self.sync_atom_names();
        Ok(())
    }

    /// 注册或替换一个（工作簿级或工作表级）命名公式。
    /// 公式按引用它的上下文动态求值，随行列结构变化与工作表重命名自动改写。
    pub fn define_named_formula(
        &mut self,
        name: &str,
        scope_sheet: Option<usize>,
        formula: &str,
    ) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        self.ensure_workbook_unprotected().map_err(|_| WorkbookError::ProtectedWorkbook)?;
        let scope_key = match scope_sheet {
            None => None,
            Some(scope) => Some(
                self.sheet_key(scope)
                    .ok_or(WorkbookError::EvalFailed(ValueError::InvalidRef))?,
            ),
        };
        let key = self.validate_named_range_name(name)?;
        if self.named_values.get(&key)
            .is_some_and(|entry| matches!(entry.definition, NamedDefinition::CustomFormula(_))) {
            return Err(WorkbookError::NameConflict);
        }
        let (source, expr) =
            Self::parse_named_formula_source(formula, false).ok_or(WorkbookError::ParseFailed)?;
        self.insert_scoped_entry(
            scope_key,
            key,
            NamedEntry {
                canonical_name: name.into(),
                definition: NamedDefinition::Formula { source, expr },
            },
        );
        self.sync_atom_names();
        Ok(())
    }

    pub fn undefine_scoped_name(&mut self, scope_sheet: Option<usize>, name: &str) -> bool {
        if self.is_inside_custom_call() || self.ensure_workbook_unprotected().is_err() {
            return false;
        }
        let scope_key = match scope_sheet {
            None => return self.undefine_name(name),
            Some(scope) => {
                let Some(sk) = self.sheet_key(scope) else {
                    return false;
                };
                Some(sk)
            }
        };
        let key = name.to_uppercase();
        let removed = self.remove_scoped_entry(scope_key, &key).is_some();
        if removed {
            self.sync_atom_names();
        }
        removed
    }

    pub fn get_scoped_named_range(
        &self,
        scope_sheet: Option<usize>,
        name: &str,
    ) -> Option<(usize, CellRange)> {
        let scope_key = match scope_sheet {
            None => None,
            Some(scope) => Some(self.sheet_key(scope)?),
        };
        let entry = self.get_scoped_entry(scope_key, &name.to_uppercase())?;
        let NamedDefinition::Range {
            sheet_key,
            range: Some(range),
        } = entry.definition
        else {
            return None;
        };
        let sheet_idx = self.sheet_index_by_key(sheet_key)?;
        Some((sheet_idx, range))
    }

    pub fn resolve_named_range_at(
        &self,
        current_sheet: usize,
        name: &str,
    ) -> Option<(usize, CellRange)> {
        let (_, _, entry) = self.resolve_scoped_entry(current_sheet, name)?;
        let NamedDefinition::Range {
            sheet_key,
            range: Some(range),
        } = entry.definition
        else {
            return None;
        };
        let sheet_idx = self.sheet_index_by_key(sheet_key)?;
        Some((sheet_idx, range))
    }

    pub fn get_named_formula(&self, scope_sheet: Option<usize>, name: &str) -> Option<&str> {
        let scope_key = match scope_sheet {
            None => None,
            Some(scope) => Some(self.sheet_key(scope)?),
        };
        let entry = self.get_scoped_entry(scope_key, &name.to_uppercase())?;
        match &entry.definition {
            NamedDefinition::Formula { source, .. } => Some(source.as_str()),
            _ => None,
        }
    }

    pub fn resolve_named_formula_at(&self, current_sheet: usize, name: &str) -> Option<&str> {
        let (_, _, entry) = self.resolve_scoped_entry(current_sheet, name)?;
        match &entry.definition {
            NamedDefinition::Formula { source, .. } => Some(source.as_str()),
            _ => None,
        }
    }

    /// 管理命令先完成纯校验，再在同一原生事务里修改定义与公式。
    pub(super) fn validate_named_range_name(&self, name: &str) -> Result<String, WorkbookError> {
        let mut chars = name.chars();
        let valid_start = chars
            .next()
            .is_some_and(|c| c.is_alphabetic() || c == '_' || c == '\\');
        if !valid_start
            || name.chars().count() > 255
            || !chars.all(|c| c.is_alphanumeric() || c == '_' || c == '.')
        {
            return Err(WorkbookError::InvalidName);
        }
        let key = name.to_uppercase();
        if is_builtin_function_name(&key) {
            return Err(WorkbookError::ReservedName);
        }
        // 引用形状的名字不能被公式解析为名称；R/C 保留给 R1C1 寻址。
        let r1c1 = key
            .strip_prefix('R')
            .and_then(|rest| rest.split_once('C'))
            .is_some_and(|(row, col)| {
                !row.is_empty()
                    && !col.is_empty()
                    && row.bytes().all(|b| b.is_ascii_digit())
                    && col.bytes().all(|b| b.is_ascii_digit())
            });
        if matches!(key.as_str(), "R" | "C")
            || r1c1
            || !matches!(parse_formula(&format!("={name}")), Some(Expr::Name(_)))
        {
            return Err(WorkbookError::InvalidName);
        }
        if self.tables.contains_key(&key) {
            return Err(WorkbookError::NameConflict);
        }
        Ok(key)
    }

    pub(super) fn named_range_definition(
        &self,
        sheet_index: usize,
        range: CellRange,
    ) -> Result<NamedDefinition, WorkbookError> {
        let range = range.normalize();
        let sheet_key = self
            .sheet_key(sheet_index)
            .ok_or(WorkbookError::EvalFailed(ValueError::InvalidRef))?;
        if range.end.row > GRID_MAX_ROW || range.end.col > GRID_MAX_COL {
            return Err(WorkbookError::EvalFailed(ValueError::InvalidRef));
        }
        Ok(NamedDefinition::Range {
            sheet_key,
            range: Some(range),
        })
    }

    /// None 表示不是范围；删除来源工作表后保留定义并返回 #REF!，
    /// 新建同名工作表不会意外接管旧引用。
    pub fn named_range(&self, name: &str) -> Result<Option<(String, CellRange)>, ValueError> {
        let Some(NamedEntry {
            definition: NamedDefinition::Range { sheet_key, range },
            ..
        }) = self.named_values.get(&name.to_uppercase())
        else {
            return Ok(None);
        };
        let index = self
            .sheet_keys
            .iter()
            .position(|key| key == sheet_key)
            .ok_or(ValueError::InvalidRef)?;
        Ok(Some((
            self.names[index].clone(),
            range.ok_or(ValueError::InvalidRef)?,
        )))
    }

    pub(crate) fn scoped_named_range(
        &self,
        current_sheet: usize,
        name: &str,
    ) -> Result<Option<(String, CellRange)>, ValueError> {
        let Some((
            _,
            _,
            NamedEntry {
                definition: NamedDefinition::Range { sheet_key, range },
                ..
            },
        )) = self.resolve_scoped_entry(current_sheet, name)
        else {
            return Ok(None);
        };
        let index = self
            .sheet_keys
            .iter()
            .position(|key| key == sheet_key)
            .ok_or(ValueError::InvalidRef)?;
        Ok(Some((
            self.names[index].clone(),
            range.ok_or(ValueError::InvalidRef)?,
        )))
    }

    pub(crate) fn sheet_qualified_named_range(
        &self,
        sheet_name: &str,
        name: &str,
    ) -> Result<Option<(String, CellRange)>, ValueError> {
        let Some((
            _,
            _,
            NamedEntry {
                definition: NamedDefinition::Range { sheet_key, range },
                ..
            },
        )) = self.resolve_sheet_qualified_entry(sheet_name, name)?
        else {
            return Ok(None);
        };
        let index = self
            .sheet_keys
            .iter()
            .position(|key| key == sheet_key)
            .ok_or(ValueError::InvalidRef)?;
        Ok(Some((
            self.names[index].clone(),
            range.ok_or(ValueError::InvalidRef)?,
        )))
    }
}
