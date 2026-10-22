//! 只保留最近一次真实提交的位置；序号独立于有界历史长度及 redo 游标。
use super::*;

#[derive(Clone, Debug)]
pub struct MutationFact {
    pub sequence: u64,
    pub changes: Vec<(u64, Vec<CellRange>)>,
}

impl WorkbookHistory {
    pub fn mutation_sequence(&self) -> u64 { self.mutation_sequence }
    pub fn last_mutation(&self) -> Option<&MutationFact> { self.last_mutation.as_ref() }
    /// 不进用户撤销栈的保护配置也属于真实持久修改。
    pub fn record_metadata_mutation(&mut self, sheet_key: u64) {
        self.publish_mutation(vec![(sheet_key, Vec::new())]);
    }

    pub(super) fn record_mutation(&mut self, entry: &HistoryEntry) {
        self.publish_mutation(entry.mutation_ranges());
    }

    pub(super) fn publish_mutation(&mut self, changes: Vec<(u64, Vec<CellRange>)>) {
        self.mutation_sequence += 1;
        self.last_mutation = Some(MutationFact { sequence: self.mutation_sequence, changes });
    }
}

impl HistoryEntry {
    pub(super) fn mutation_ranges(&self) -> Vec<(u64, Vec<CellRange>)> {
        let mut positions = std::collections::BTreeMap::<u64, Vec<CellRange>>::new();
        let mut metadata_keys = vec![self.sheet_key];
        let mut stable_positions = Vec::new();
        let mut add = |sheet: usize, range: Option<CellRange>| {
            let key = self.affected_indices.iter().position(|index| *index == sheet)
                .and_then(|index| self.affected_keys.get(index)).copied().unwrap_or(self.sheet_key);
            let ranges = positions.entry(key).or_default();
            if let Some(range) = range {
                if !ranges.contains(&range) { ranges.push(range); }
            }
        };
        match &self.change {
            HistoryChange::Cells { before, after, table_rows, .. } => {
                metadata_keys.clear();
                for ((sheet, before), (_, after)) in before.iter().zip(after) {
                    for range in crate::host::changed_ranges(before, after) { add(*sheet, Some(range)); }
                }
                if !table_rows.is_empty() { metadata_keys.extend(&self.affected_keys); }
            }
            HistoryChange::Structure(change) => {
                for (sheet, range) in change.mutation_ranges() { add(sheet, range); }
            }
            HistoryChange::Sheet(change) => {
                if let SheetHistoryChange::Presence { mutation, .. } = change.as_ref() {
                    stable_positions.extend(mutation.iter().cloned());
                }
                if let SheetHistoryChange::Rename { before_refs, after_refs, templates,
                    before_rules, after_rules, before_validations, after_validations, .. } = change.as_ref() {
                    for ((sheet, addr, before), (_, _, after)) in before_refs.iter().zip(after_refs) {
                        if before != after { add(*sheet, Some(CellRange::single(*addr))); }
                    }
                    for change in templates { add(change.sheet, change.mutation_range()); }
                    metadata_keys.extend(before_rules.iter().zip(after_rules)
                        .filter(|((_, before), (_, after))| before != after).map(|((key, _), _)| *key));
                    metadata_keys.extend(before_validations.iter().zip(after_validations)
                        .filter(|((_, before), (_, after))| before != after).map(|((key, _), _)| *key));
                }
            }
            HistoryChange::TableDefinition(change) => {
                for (sheet, range) in change.mutation_ranges() { add(sheet, range); }
            }
            HistoryChange::NamedRange(change) => {
                for (sheet, range) in change.mutation_ranges() { add(sheet, range); }
            }
            HistoryChange::CustomFormula(_) => metadata_keys.clear(),
            HistoryChange::ConditionalFormat(change) => {
                for range in change.mutation_ranges() { add(self.sheet, Some(range)); }
            }
            HistoryChange::Visibility(_) | HistoryChange::Freeze(_) | HistoryChange::Outline(_)
                | HistoryChange::Filter(_) => {},
            _ => add(self.sheet, Some(self.range)),
        }
        // 空范围数组明确表示目录/结构元数据变化，不把相同主范围虚构到每张表。
        if matches!(self.change, HistoryChange::Structure(_) | HistoryChange::NamedRange(_)
            | HistoryChange::TableDefinition(_)) {
            metadata_keys.extend(&self.affected_keys);
        }
        // 权限足迹可能包含未修改的整本工作簿，不能直接充当事件修改清单。
        for key in metadata_keys { positions.entry(key).or_default(); }
        for (key, ranges) in stable_positions { positions.entry(key).or_default().extend(ranges); }
        for ranges in positions.values_mut() {
            let mut unique = Vec::new();
            for range in ranges.drain(..) { if !unique.contains(&range) { unique.push(range); } }
            *ranges = unique;
        }
        positions.into_iter().collect()
    }
}
