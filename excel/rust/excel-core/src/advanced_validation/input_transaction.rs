//! 真实候选先沿原生安装/重算，再验证；复用原公式输入的快照回滚，不模拟 spill 布局。
use super::*;
use crate::history_snapshot::HistorySnapshot;

impl Workbook {
    /// 写候选的原生结算；调用前必须已暂停所有 Sheet 地址订阅，直到接受或完整回滚。
    /// 只重投真实源范围的既有依赖，不全表失效，也不重算无关 volatile 公式。
    pub(crate) fn settle_validation_candidate(&mut self, sheet: usize, range: CellRange) {
        let arrays = self.array_dependents_for_range(sheet, range);
        self.store.flush();
        self.recompute_array_formula_groups(arrays);
        self.store.flush();
    }

    pub(crate) fn apply_validated_input(
        &mut self,
        sheet: usize,
        addr: CellAddress,
        install: impl FnOnce(&mut Self) -> Result<(), &'static str>,
    ) -> Result<(), &'static str> {
        if self.sheets[sheet].data_validation_at(addr).is_none() {
            return install(self);
        }
        let before = HistorySnapshot::capture(&self.sheets[sheet], CellRange::single(addr), true);
        let table_rows = self.insert_rows_for_writes([(sheet, addr)]);
        // 与原 set_input_formula 一致：拒绝值不发布给本表或跨表订阅者。
        let observers: Vec<_> = self
            .sheets
            .iter_mut()
            .map(Sheet::suspend_structure_notifications)
            .collect();
        let store = self.store.clone();
        let mut result = Ok(());
        store.batch(|_| {
            result = install(self).and_then(|_| {
                self.settle_validation_candidate(sheet, CellRange::single(addr));
                let value =
                    crate::sheet::collapse_array_for_eval(self.sheets[sheet].peek_value(addr));
                self.validate_input_value(sheet, addr, &value)
            });
            if result.is_err() {
                let activated: Vec<_> = table_rows
                    .iter()
                    .filter(|before| {
                        self.get_table(before.name())
                            == Some(&(*before).clone().with_insert_row(false))
                    })
                    .cloned()
                    .collect();
                self.restore_cell_history(&[(sheet, before.clone())], &activated, true)
                    .expect("the input transaction keeps its original worksheet");
                self.settle_validation_candidate(sheet, CellRange::single(addr));
            }
        });
        for (sheet, observer) in self.sheets.iter_mut().zip(observers) {
            sheet.resume_structure_notifications(observer);
        }
        result
    }
}
