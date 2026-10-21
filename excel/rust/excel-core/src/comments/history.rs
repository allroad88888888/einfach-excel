//! 每次发言或状态切换只生成一条原生历史；失败前不改任何工作簿状态。
use super::*;
use crate::comments::*;

impl WorkbookHistory {
    pub fn change_comment(
        &mut self,
        workbook: &mut Workbook,
        sheet: usize,
        addr: crate::CellAddress,
        change: NativeCommentChange,
        now_ms: i64,
    ) -> Result<bool, &'static str> {
        if self.pending.is_some() || workbook.is_inside_custom_call() {
            return Err("Another history command is pending.");
        }
        let range = CellRange::single(addr);
        validate_target(workbook, sheet, range)?;
        workbook.ensure_range_editable(sheet, range)?;
        if !(0..=8_640_000_000_000_000).contains(&now_ms) {
            return Err("Invalid comment timestamp.");
        }
        let target = workbook.sheet(sheet).unwrap();
        if target
            .merged_range_at(addr)
            .is_some_and(|range| range.start != addr)
        {
            return Err("Select the anchor cell before changing its comments.");
        }
        let current = target.comment(addr);
        let (kind, author, body, label) = match change {
            NativeCommentChange::Create { author, body } => {
                if current.is_some() {
                    return Err("This cell already has a comment thread.");
                }
                (
                    CommentEntryKind::Message,
                    author,
                    Some(normalize_body(&body)?),
                    "New comment",
                )
            }
            NativeCommentChange::Reply { author, body } => {
                let thread = current.ok_or("The comment thread no longer exists.")?;
                if thread.resolved {
                    return Err("Reopen the thread before replying.");
                }
                (
                    CommentEntryKind::Message,
                    author,
                    Some(normalize_body(&body)?),
                    "Reply to comment",
                )
            }
            NativeCommentChange::Resolve { author } => {
                let thread = current.ok_or("The comment thread no longer exists.")?;
                if thread.resolved {
                    return Ok(false);
                }
                (CommentEntryKind::Resolve, author, None, "Resolve comment")
            }
            NativeCommentChange::Reopen { author } => {
                let thread = current.ok_or("The comment thread no longer exists.")?;
                if !thread.resolved {
                    return Ok(false);
                }
                (CommentEntryKind::Reopen, author, None, "Reopen comment")
            }
        };
        let author = normalize_author(&author)?;
        let mut next = current.cloned().unwrap_or(NativeCommentThread {
            entries: vec![],
            resolved: false,
        });
        if next.entries.len() >= MAX_COMMENT_ENTRIES {
            return Err("A comment thread cannot exceed 1000 entries.");
        }
        // 宿主提供本机时间；时钟回拨不打乱线程顺序，历史恢复保留原时间。
        let created_at = now_ms.max(next.entries.last().map_or(0, |entry| entry.created_at));
        next.resolved = match kind {
            CommentEntryKind::Resolve => true,
            CommentEntryKind::Reopen => false,
            CommentEntryKind::Message => next.resolved,
        };
        next.entries.push(NativeCommentEntry {
            kind,
            author,
            body,
            created_at,
        });
        self.begin(workbook, sheet, range, label, false)?;
        workbook
            .sheet_mut(sheet)
            .unwrap()
            .comments
            .insert(addr, next);
        self.finish(workbook, true)?;
        Ok(true)
    }
}
