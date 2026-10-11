//! 命名区域的可移植快照；表索引在恢复时重新绑定到目标工作簿的稳定身份。
use super::*;

#[derive(Clone, Debug, PartialEq)]
pub struct NamedRangeSnapshot {
    pub name: String,
    /// None 是已有的 #REF! 定义，不是缺省范围，也不能绑定新建的同名表。
    pub target: Option<(usize, CellRange)>,
}

impl Workbook {
    /// 纯元数据读取，不求值、不物化范围内的 cell atom。
    pub fn snapshot_named_ranges(&self) -> Vec<NamedRangeSnapshot> {
        self.named_values
            .values()
            .filter_map(|entry| {
                let NamedDefinition::Range { sheet_key, range } = entry.definition else {
                    return None;
                };
                let sheet = self.sheet_keys.iter().position(|key| *key == sheet_key);
                Some(NamedRangeSnapshot {
                    name: entry.canonical_name.clone(),
                    target: sheet.zip(range),
                })
            })
            .collect()
    }

    /// 整体替换范围定义；常量／LAMBDA 名称不属于此快照，不被删除或覆盖。
    pub fn restore_named_ranges(
        &mut self,
        entries: Vec<NamedRangeSnapshot>,
    ) -> Result<(), WorkbookError> {
        if self.is_inside_custom_call() {
            return Err(WorkbookError::MutationDuringCustomCall);
        }
        let mut next = BTreeMap::new();
        for entry in entries {
            let key = self.validate_named_range_name(&entry.name)?;
            if next.contains_key(&key)
                || self
                    .named_values
                    .get(&key)
                    .is_some_and(|entry| matches!(entry.definition, NamedDefinition::Value(_)))
            {
                return Err(WorkbookError::NameConflict);
            }
            let definition = match entry.target {
                Some((sheet, range)) => self.named_range_definition(sheet, range)?,
                // 工作表 key 从 1 分配。0 表示无来源；None 范围永久保持 #REF!。
                None => NamedDefinition::Range {
                    sheet_key: 0,
                    range: None,
                },
            };
            next.insert(
                key,
                NamedEntry {
                    canonical_name: entry.name,
                    definition,
                },
            );
        }
        // 所有校验已完成。订阅者只收到最终投影，不看到中途缺名或旧 spill。
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        self.named_values
            .retain(|_, entry| matches!(entry.definition, NamedDefinition::Value(_)));
        self.named_values.extend(next);
        self.sync_atom_names();
        for (sheet, observers) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observers);
        }
        Ok(())
    }
}
