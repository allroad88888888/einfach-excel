//! 归档已保存的源码变化转换成稳定身份位置；恢复取走归档后仍由 Presence 保留。
use super::*;

impl ArchivedWorksheet {
    pub(crate) fn mutation_ranges(&self, workbook: &Workbook) -> Vec<(u64, Vec<CellRange>)> {
        let mut changes = BTreeMap::<u64, Vec<CellRange>>::new();
        for (sheet, addr, source) in &self.references {
            let current = if *sheet > self.index { sheet - 1 } else { *sheet };
            // 撤销新增会恢复悬空源码；相同源不应谎报持久格子修改。
            if workbook.sheets[current].formula_text_at(*addr).as_ref() != Some(source) {
                changes.entry(self.remaining_keys[current]).or_default().push(CellRange::single(*addr));
            }
        }
        for (key, before) in &self.conditional_references {
            let index = workbook.sheet_keys.iter().position(|current| current == key).unwrap();
            let ranges = crate::host::conditional_ranges(before, &workbook.conditional_formats[index].rules);
            if !ranges.is_empty() { changes.entry(*key).or_default().extend(ranges); }
        }
        for (key, before) in &self.validation_references {
            let index = workbook.sheet_keys.iter().position(|current| current == key).unwrap();
            let ranges = crate::host::validation_ranges(before, &workbook.sheets[index].data_validations);
            if !ranges.is_empty() { changes.entry(*key).or_default().extend(ranges); }
        }
        for template in &self.templates {
            changes.entry(template.mutation_sheet_key()).or_default();
        }
        changes.into_iter().collect()
    }
}
