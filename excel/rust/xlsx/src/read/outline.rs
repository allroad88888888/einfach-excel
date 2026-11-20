//! `<row outlineLevel="..." collapsed="..."/>` 与 `<col ... outlineLevel="..." collapsed="..."/>` → 原生行列大纲。

use std::cmp::Reverse;
use std::collections::HashSet;

use super::dom::Node;
use super::worksheet::SheetData;
use crate::native::{
    OutlineGroup, SheetOutline, MAX_COLS, MAX_OUTLINE_DEPTH, MAX_OUTLINE_GROUPS, MAX_ROWS,
};

#[derive(Clone, Copy)]
pub struct OutlineSpan {
    pub start: u32,
    pub end: u32,
    pub level: u32,
    pub collapsed: bool,
}

fn reconstruct_axis(
    raw_spans: &[OutlineSpan],
    hidden_indices: &mut Vec<u32>,
    summary_after: bool,
    limit: u32,
) -> (Vec<OutlineGroup>, usize) {
    if raw_spans.is_empty() {
        return (Vec::new(), 0);
    }
    let mut losses = 0usize;
    let mut collapsed_markers: HashSet<u32> = HashSet::new();
    let mut level_segments: Vec<(u32, u32, usize)> = Vec::new();

    for span in raw_spans {
        if span.start > span.end || span.start >= limit {
            continue;
        }
        let end = span.end.min(limit - 1);
        if span.collapsed {
            for idx in span.start..=end {
                collapsed_markers.insert(idx);
            }
        }
        if span.level == 0 {
            continue;
        }
        if span.level as usize > MAX_OUTLINE_DEPTH {
            losses += 1;
        }
        let clamped = (span.level as usize).min(MAX_OUTLINE_DEPTH);
        level_segments.push((span.start, end, clamped));
    }

    if level_segments.is_empty() {
        return (Vec::new(), losses);
    }

    level_segments.sort_by_key(|&(start, end, _)| (start, end));
    // 去重/合并重叠片段：同一位置取最后出现的层级。
    let mut normalized: Vec<(u32, u32, usize)> = Vec::with_capacity(level_segments.len());
    for (s, e, lvl) in level_segments {
        if let Some(last) = normalized.last_mut() {
            if s <= last.1 {
                if s > last.0 {
                    let prev_end = last.1;
                    let prev_lvl = last.2;
                    last.1 = s - 1;
                    normalized.push((s, e, lvl));
                    if e < prev_end {
                        normalized.push((e + 1, prev_end, prev_lvl));
                    }
                    continue;
                } else {
                    last.2 = lvl;
                    last.1 = last.1.max(e);
                    continue;
                }
            } else if s == last.1 + 1 && last.2 == lvl {
                last.1 = e;
                continue;
            }
        }
        normalized.push((s, e, lvl));
    }

    // 栈式重建区间：(group, depth 1..=8)。
    let mut built: Vec<(OutlineGroup, usize)> = Vec::new();
    let mut stack: Vec<u32> = Vec::new();
    let mut prev_end: Option<u32> = None;

    for (seg_start, seg_end, seg_lvl) in &normalized {
        if let Some(pe) = prev_end {
            if *seg_start > pe + 1 {
                while let Some(g_start) = stack.pop() {
                    let depth = stack.len() + 1;
                    built.push((
                        OutlineGroup { start: g_start, end: pe, collapsed: false, subtotal: None },
                        depth,
                    ));
                }
            } else {
                while stack.len() > *seg_lvl {
                    let g_start = stack.pop().unwrap();
                    let depth = stack.len() + 1;
                    built.push((
                        OutlineGroup {
                            start: g_start,
                            end: seg_start - 1,
                            collapsed: false,
                            subtotal: None,
                        },
                        depth,
                    ));
                }
            }
        }
        while stack.len() < *seg_lvl {
            stack.push(*seg_start);
        }
        prev_end = Some(*seg_end);
    }
    if let Some(pe) = prev_end {
        while let Some(g_start) = stack.pop() {
            let depth = stack.len() + 1;
            built.push((
                OutlineGroup { start: g_start, end: pe, collapsed: false, subtotal: None },
                depth,
            ));
        }
    }

    let hidden_set: HashSet<u32> = hidden_indices.iter().copied().collect();
    let level_at = |idx: u32| -> usize {
        normalized
            .binary_search_by(|&(s, e, _)| {
                if idx < s {
                    std::cmp::Ordering::Greater
                } else if idx > e {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Equal
                }
            })
            .ok()
            .map_or(0, |i| normalized[i].2)
    };

    // 自内向外判定折叠，避免子组汇总格上的 `collapsed="1"` 被误认为外层组自身折叠。
    let has_explicit_markers = !collapsed_markers.is_empty();
    built.sort_by_key(|(g, depth)| (Reverse(*depth), g.start, Reverse(g.end)));
    let mut consumed_summary: HashSet<u32> = HashSet::new();
    for (group, depth) in &mut built {
        let all_hidden = (group.start..=group.end).all(|idx| hidden_set.contains(&idx));
        if !has_explicit_markers {
            group.collapsed = all_hidden;
            continue;
        }
        let summary_idx = if summary_after {
            group.end.checked_add(1).filter(|&i| i < limit)
        } else {
            group.start.checked_sub(1)
        };
        let any_hidden_in_group = (group.start..=group.end).any(|idx| hidden_set.contains(&idx));
        let summary_marked = summary_idx.is_some_and(|i| {
            collapsed_markers.contains(&i)
                && !consumed_summary.contains(&i)
                && (all_hidden || !any_hidden_in_group)
        });
        let own_marked = (group.start..=group.end).any(|idx| {
            collapsed_markers.contains(&idx)
                && !consumed_summary.contains(&idx)
                && level_at(idx) == *depth
        });
        if own_marked || summary_marked {
            group.collapsed = true;
            if summary_marked {
                if let Some(i) = summary_idx {
                    consumed_summary.insert(i);
                }
            }
        }
    }

    built.sort_by_key(|(g, _)| (g.start, Reverse(g.end)));
    let mut groups: Vec<OutlineGroup> = built.into_iter().map(|(g, _)| g).collect();
    if groups.len() > MAX_OUTLINE_GROUPS {
        groups.truncate(MAX_OUTLINE_GROUPS);
        losses += 1;
    }

    // 大纲折叠导致的隐藏归属大纲模型，从手动隐藏列表中剔除，展开分组即可正常恢复显示。
    let collapsed_indices: HashSet<u32> = groups
        .iter()
        .filter(|g| g.collapsed)
        .flat_map(|g| g.start..=g.end)
        .collect();
    if !collapsed_indices.is_empty() {
        hidden_indices.retain(|idx| !collapsed_indices.contains(idx));
    }

    (groups, losses)
}

pub fn extract(data: &mut SheetData, extras: Option<&Node>) -> (Option<SheetOutline>, usize) {
    let outline_pr = extras
        .and_then(|e| e.child("sheetPr"))
        .and_then(|pr| pr.child("outlinePr"));
    let summary_below = outline_pr.map_or(true, |pr| pr.attr_bool("summaryBelow", true));
    let summary_right = outline_pr.map_or(true, |pr| pr.attr_bool("summaryRight", true));

    let (rows, row_losses) =
        reconstruct_axis(&data.row_outlines, &mut data.hidden_rows, summary_below, MAX_ROWS);
    let (columns, col_losses) =
        reconstruct_axis(&data.col_outlines, &mut data.hidden_cols, summary_right, MAX_COLS);
    let outline = SheetOutline { rows, columns };
    let kept = (!outline.is_empty()).then_some(outline);
    (kept, row_losses + col_losses)
}
