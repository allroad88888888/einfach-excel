//! 工作表持有的手动隐藏列；与列宽分开保存，恢复显示后原尺寸仍在。
use super::*;

impl Sheet {
    pub(crate) fn hidden_columns(&self) -> Vec<u32> {
        self.hidden_columns.iter().copied().collect()
    }

    pub(crate) fn replace_hidden_columns(&mut self, columns: BTreeSet<u32>) {
        self.hidden_columns = columns;
    }

    pub(super) fn shift_hidden_columns(&mut self, at: u32, count: u32, insert: bool) {
        // 两轴使用同一位移算法；被删列消失，插入位置后的隐藏状态跟随原列。
        self.hidden_columns = self
            .hidden_columns
            .iter()
            .filter_map(|&col| shift_hidden_row(col, at, count, insert))
            .collect();
    }
}
