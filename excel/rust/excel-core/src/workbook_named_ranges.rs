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
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        let key = self.validate_named_range_name(name)?;
        let definition = self.named_range_definition(sheet_index, range)?;
        self.named_values.insert(
            key,
            NamedEntry {
                canonical_name: name.into(),
                definition,
            },
        );
        self.sync_atom_names();
        Ok(())
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
}
