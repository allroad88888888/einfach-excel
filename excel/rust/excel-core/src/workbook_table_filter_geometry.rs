//! Table 几何变更只搬移/裁剪筛选快照，不扫描单元格。
use super::*;
use crate::shift::ShiftEdit;

impl TableEntry {
    /// 导入不能把其它表的行或汇总行伪装成本 Table 的筛选结果。
    pub(super) fn valid_filter(&self) -> bool {
        let Some(filter) = self.auto_filter() else { return true; };
        let data = self.filter_data_range();
        self.has_headers && filter.has_conditions() && filter.range().is_none()
            && (filter.groups().is_empty() || filter.rules().is_empty())
            && crate::advanced_filter::validate_groups(filter.groups()).is_ok()
            && crate::advanced_filter::FilterCriteria::from_filter(filter).rules().all(|rule|
                self.range.start.col <= rule.col_index() && rule.col_index() <= self.range.end.col)
            && filter.hidden_set().iter().all(|row|
                data.is_some_and(|data| data.start.row <= *row && *row <= data.end.row))
    }

    /// 调整范围后丢掉已不存在的列条件与数据行；关闭表头同时关闭 Table 筛选。
    pub(super) fn clip_filter(&mut self) {
        if !self.has_headers {
            self.auto_filter = None;
            return;
        }
        let data = self.filter_data_range();
        let Some(filter) = self.auto_filter.as_mut() else { return; };
        filter.retain_conditions(|rule|
            self.range.start.col <= rule.col_index() && rule.col_index() <= self.range.end.col);
        if !filter.has_conditions() {
            self.auto_filter = None;
            return;
        }
        filter.hidden_set_mut().retain(|row|
            data.is_some_and(|data| data.start.row <= *row && *row <= data.end.row));
    }

    /// 先设置最终 Table 几何，再按同一次插删移动条件/快照。
    /// 局部列带插行只会对已确认整块位移的 Table 调用这里。
    pub(super) fn shift_filter(&mut self, edit: ShiftEdit) {
        if let Some(filter) = self.auto_filter.as_mut() {
            if edit.is_row_edit() {
                filter.set_hidden(filter.hidden_set().iter().filter_map(|row| {
                    let next = edit.apply(CellAddress::new(*row, 0)).row;
                    (next <= GRID_MAX_ROW).then_some(next)
                }).collect());
            } else {
                filter.shift_rule_columns(edit);
            }
        }
        self.clip_filter();
    }
}
