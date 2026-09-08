//! 剪贴板合并矩形的平移/转置/平铺预检；不存全表副本，不修改内容。
use super::*;

/// 一个逻辑格粘到一个已有合并格时只写锚点，不要求两边物理尺寸相同。
pub(super) fn logical_target(
    snapshot: &ClipboardSnapshot,
    sheet: &crate::Sheet,
    options: &ClipboardPasteOptions,
) -> Option<CellAddress> {
    if options.mode == ClipboardPasteMode::ColumnWidths {
        return None;
    }
    let scalar = snapshot.source.start == snapshot.source.end;
    let logical = scalar || (!snapshot.cut && snapshot.merges == [snapshot.source]);
    let target = sheet.merged_range_at(options.selection.start)?;
    (logical && (options.selection == target || options.selection.start == options.selection.end))
        .then_some(target.start)
}

pub(super) struct MergePastePlan {
    remove: Vec<CellRange>,
    insert: Vec<CellRange>,
    pub scalar: bool,
}

impl MergePastePlan {
    pub fn prepare(
        workbook: &Workbook,
        snapshot: &ClipboardSnapshot,
        sheet_idx: usize,
        options: &ClipboardPasteOptions,
        target: CellRange,
        collapsed: bool,
    ) -> Result<Self, ClipboardError> {
        let sheet = workbook.sheet(sheet_idx).ok_or("CLIPBOARD_INVALID_SHEET")?;
        let scalar = collapsed || snapshot.source.start == snapshot.source.end;
        // 值/公式/数字格式/运算不改变目标几何；纯文本剪贴板本来也没有合并布局。
        let copy_layout = !scalar
            && snapshot.source_sheet.is_some()
            && options.arithmetic == ClipboardArithmetic::None
            && matches!(
                options.mode,
                ClipboardPasteMode::All
                    | ClipboardPasteMode::Formats
                    | ClipboardPasteMode::ValuesAndFormats
            );
        let mut insert = Vec::new();
        if copy_layout {
            let (rows, cols) = if options.transpose {
                (snapshot.cols(), snapshot.rows())
            } else {
                (snapshot.rows(), snapshot.cols())
            };
            for row in (target.start.row..=target.end.row).step_by(rows as usize) {
                for col in (target.start.col..=target.end.col).step_by(cols as usize) {
                    for source in &snapshot.merges {
                        let r = source.start.row - snapshot.source.start.row;
                        let c = source.start.col - snapshot.source.start.col;
                        if options.skip_blanks
                            && snapshot.cells[(r * snapshot.cols() + c) as usize].is_blank()
                        {
                            continue;
                        }
                        let range = if options.transpose {
                            CellRange::new(
                                CellAddress::new(row + c, col + r),
                                CellAddress::new(
                                    row + c + source.cols() - 1,
                                    col + r + source.rows() - 1,
                                ),
                            )
                        } else {
                            CellRange::new(
                                CellAddress::new(row + r, col + c),
                                CellAddress::new(
                                    row + r + source.rows() - 1,
                                    col + c + source.cols() - 1,
                                ),
                            )
                        };
                        if sheet.spill_intersecting(range).is_some() {
                            return Err("CLIPBOARD_SPILL_TARGET");
                        }
                        if workbook.tables.values().any(|table| {
                            Some(table.sheet_name()) == workbook.name(sheet_idx)
                                && table.range().intersects(range)
                        }) {
                            return Err("CLIPBOARD_MERGE_TABLE");
                        }
                        // 格式粘贴和跳过空白不能借合并悄悄抹掉目标已有内容。
                        if options.mode == ClipboardPasteMode::Formats || options.skip_blanks {
                            let mut content = false;
                            sheet.for_each_non_empty_in_range(range, |addr| {
                                content |= addr != range.start
                            });
                            if content {
                                return Err("CLIPBOARD_MERGE_CONTENT");
                            }
                        }
                        insert.push(range);
                    }
                }
            }
        }
        let mut remove = if snapshot.cut {
            snapshot.merges.clone()
        } else {
            Vec::new()
        };
        for old in sheet.merges_in_range(target) {
            // 重叠剪切先搬走源矩形，因此目标可以穿过旧源框的一部分。
            if remove.contains(&old) {
                continue;
            }
            if scalar && target.start == target.end && old.contains(target.start) {
                continue;
            }
            if !target.contains(old.start) || !target.contains(old.end) {
                return Err("CLIPBOARD_PARTIAL_MERGE");
            }
            if copy_layout && (!options.skip_blanks || insert.iter().any(|new| new.intersects(old)))
            {
                remove.push(old);
            }
        }
        // 相同几何不算改动，避免复制到自身制造一条空历史。
        remove.retain(|old| !insert.contains(old));
        insert.retain(|new| !sheet.merged_ranges().contains(new));
        Ok(Self {
            remove,
            insert,
            scalar,
        })
    }

    pub fn changed(&self) -> bool {
        !self.remove.is_empty() || !self.insert.is_empty()
    }

    pub fn covered(&self, sheet: &crate::Sheet, addr: CellAddress) -> bool {
        self.insert
            .iter()
            .copied()
            .find(|range| range.contains(addr))
            .or_else(|| {
                sheet
                    .merged_range_at(addr)
                    .filter(|range| !self.remove.contains(range))
            })
            .is_some_and(|range| range.start != addr)
    }

    pub fn apply(&self, sheet: &mut crate::Sheet) {
        for range in &self.remove {
            sheet.replace_merges_in_range(*range, &[]);
        }
        for range in &self.insert {
            sheet.replace_merges_in_range(*range, &[*range]);
        }
    }
}
