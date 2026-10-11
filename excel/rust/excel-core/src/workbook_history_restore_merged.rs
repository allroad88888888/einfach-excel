//! 合并粘贴历史按整批原始内容回放，几何落定后才重新投影数组。
use super::*;
use crate::history_snapshot::HistorySnapshot;

impl Workbook {
    pub(crate) fn restore_merged_history_snapshots(
        &mut self,
        snapshots: &[(usize, &HistorySnapshot)],
    ) -> Result<(), &'static str> {
        if self.is_inside_custom_call() {
            return Err("MUTATION_DURING_CUSTOM_CALL");
        }
        let indices: std::collections::BTreeSet<_> =
            snapshots.iter().map(|(sheet, _)| *sheet).collect();
        let observers: Vec<_> = indices
            .iter()
            .map(|sheet| {
                (
                    *sheet,
                    self.sheets[*sheet].suspend_structure_notifications(),
                )
            })
            .collect();
        let store = self.store.clone();
        store.batch(|_| {
            let mut anchors = Vec::new();
            for index in &indices {
                let parts: Vec<_> = snapshots
                    .iter()
                    .filter(|(sheet, _)| sheet == index)
                    .map(|(_, snapshot)| *snapshot)
                    .collect();
                let sheet = &mut self.sheets[*index];
                anchors.push((*index, sheet.restore_structure_content(&parts)));
                // 重叠剪切的源/目标快照可能重复包含同一个框：先清所有旧框，再恢复唯一矩形。
                for snapshot in &parts {
                    if snapshot.merges.is_some() {
                        sheet.replace_merges_in_range(snapshot.range, &[]);
                    }
                }
                for snapshot in parts {
                    for range in snapshot.merges.as_deref().unwrap_or_default() {
                        sheet.replace_merges_in_range(*range, &[*range]);
                    }
                }
            }
            for (index, mut anchors) in anchors {
                anchors.sort_unstable_by_key(|addr| (addr.row, addr.col));
                anchors.dedup();
                // set_array 写入的是原始数组值，不是公式结果；先恢复它的投影再读取公式消费者。
                for addr in &anchors {
                    if self.sheets[index].formula_text_at(*addr).is_none() {
                        if let Value::Array(values) = self.sheets[index].peek_value(*addr) {
                            self.sheets[index].set_array(&addr.to_string(), values)
                                .expect("snapshot addresses are valid");
                        }
                    }
                }
                self.sheets[index].project_bulk_spill_anchors(anchors);
            }
        });
        for (index, observers) in observers {
            self.sheets[index].resume_structure_notifications(observers);
        }
        Ok(())
    }
}
