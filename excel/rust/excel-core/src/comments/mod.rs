//! 每格一个线程；数据独立于备注、值与公式，只通过原生历史事务修改。
mod types;
mod structure;
pub use types::*;
use crate::{CellAddress, CellRange, Sheet, Workbook};

pub fn retained_bytes(threads: &[(CellAddress, NativeCommentThread)]) -> usize {
    threads.iter().map(|(_, thread)| 32 + thread.retained_bytes()).sum()
}

impl Sheet {
    pub fn comment(&self, addr: CellAddress) -> Option<&NativeCommentThread> {
        self.comments.get(&addr)
    }

    /// 滚动投影只枚举坐标，不为一个标记克隆整串发言正文。
    pub fn comment_cells_in_range(&self, range: CellRange) -> Vec<CellAddress> {
        if range.start == range.end {
            return self.comments.contains_key(&range.start).then_some(range.start).into_iter().collect();
        }
        let mut cells: Vec<_> = self.comments.keys().copied().filter(|addr| range.contains(*addr)).collect();
        cells.sort_by_key(|addr| (addr.row, addr.col));
        cells
    }

    pub fn comments_in_range(&self, range: CellRange) -> Vec<(CellAddress, NativeCommentThread)> {
        if range.start == range.end {
            return self.comment(range.start).map(|thread| vec![(range.start, thread.clone())])
                .unwrap_or_default();
        }
        let mut threads: Vec<_> = self.comments.iter().filter(|(addr, _)| range.contains(**addr))
            .map(|(addr, thread)| (*addr, thread.clone())).collect();
        threads.sort_by_key(|(addr, _)| (addr.row, addr.col));
        threads
    }

    pub(crate) fn restore_comments(&mut self, range: CellRange,
        threads: &[(CellAddress, NativeCommentThread)]) {
        self.comments.retain(|addr, _| !range.contains(*addr));
        self.comments.extend(threads.iter().cloned());
    }
}

impl Workbook {
    /// 文件重建的安装入口仍检查真实权限，不能从公开 sheet_mut 绕过保护。
    pub fn restore_comment_thread(&mut self, sheet: usize, addr: CellAddress,
        thread: NativeCommentThread) -> Result<(), &'static str> {
        self.ensure_range_editable(sheet, CellRange::single(addr))?;
        if self.is_inside_custom_call() { return Err("Another mutation is in progress."); }
        thread.validate()?;
        self.sheet_mut(sheet).unwrap().comments.insert(addr, thread);
        Ok(())
    }
}
