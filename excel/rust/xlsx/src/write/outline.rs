//! 原生行列大纲 → `<row>` / `<col>` 的 `outlineLevel`、`collapsed`、`hidden` 与 `<outlinePr>`。

use std::collections::{BTreeMap, BTreeSet, HashMap};

use crate::native::{
    OutlineGroup, SheetOutline, MAX_COLS, MAX_OUTLINE_DEPTH, MAX_OUTLINE_GROUPS, MAX_ROWS,
};

pub struct AxisPlan {
    pub levels: BTreeMap<u32, u8>,
    pub hidden: BTreeSet<u32>,
    pub collapsed_markers: BTreeSet<u32>,
    pub summary_after: bool,
}

impl Default for AxisPlan {
    fn default() -> Self {
        Self {
            levels: BTreeMap::new(),
            hidden: BTreeSet::new(),
            collapsed_markers: BTreeSet::new(),
            summary_after: true,
        }
    }
}

impl AxisPlan {
    pub fn touched_indices(&self) -> impl Iterator<Item = u32> + '_ {
        self.levels.keys().chain(&self.collapsed_markers).copied()
    }
}

#[derive(Default)]
pub struct SheetOutlinePlan {
    pub rows: AxisPlan,
    pub cols: AxisPlan,
    pub losses: usize,
}

fn build_axis(groups: &[OutlineGroup], limit: u32) -> (AxisPlan, usize) {
    let summary_after = !groups.iter().any(|g| {
        g.subtotal
            .as_ref()
            .and_then(|s| s.get("summaryAbove"))
            .and_then(|v| v.as_bool())
            == Some(true)
    });
    let mut plan = AxisPlan { summary_after, ..Default::default() };
    if groups.is_empty() {
        return (plan, 0);
    }
    let mut losses = 0usize;
    let capped = if groups.len() > MAX_OUTLINE_GROUPS {
        losses += 1;
        &groups[..MAX_OUTLINE_GROUPS]
    } else {
        groups
    };

    let mut stack: Vec<&OutlineGroup> = Vec::new();
    let mut with_depth: Vec<(&OutlineGroup, u8)> = Vec::new();
    for group in capped {
        if group.start > group.end || group.end >= limit {
            losses += 1;
            continue;
        }
        while stack.last().is_some_and(|p| p.end < group.start) {
            stack.pop();
        }
        if stack.last().is_some_and(|p| p.end < group.end) {
            losses += 1;
            continue;
        }
        stack.push(group);
        if stack.len() > MAX_OUTLINE_DEPTH {
            losses += 1;
            stack.pop();
            continue;
        }
        let depth = stack.len() as u8;
        for idx in group.start..=group.end {
            let entry = plan.levels.entry(idx).or_insert(0);
            *entry = (*entry).max(depth);
            if group.collapsed {
                plan.hidden.insert(idx);
            }
        }
        with_depth.push((group, depth));
    }

    let summary_of = |g: &OutlineGroup| -> Option<u32> {
        if summary_after {
            g.end.checked_add(1).filter(|&i| i < limit)
        } else {
            g.start.checked_sub(1)
        }
    };

    let mut summary_counts: HashMap<u32, usize> = HashMap::new();
    for (g, _) in &with_depth {
        if let Some(s) = summary_of(g) {
            *summary_counts.entry(s).or_insert(0) += 1;
        }
    }

    for (g, depth) in with_depth {
        if !g.collapsed {
            continue;
        }
        if let Some(s) = summary_of(g).filter(|s| summary_counts.get(s) == Some(&1)) {
            plan.collapsed_markers.insert(s);
        } else if let Some(own) = (g.start..=g.end).find(|i| plan.levels.get(i) == Some(&depth)) {
            plan.collapsed_markers.insert(own);
        }
    }

    (plan, losses)
}

pub fn plan(outline: Option<&SheetOutline>) -> SheetOutlinePlan {
    let Some(outline) = outline else {
        return SheetOutlinePlan {
            rows: AxisPlan { summary_after: true, ..Default::default() },
            cols: AxisPlan { summary_after: true, ..Default::default() },
            losses: 0,
        };
    };
    let (rows, r_loss) = build_axis(&outline.rows, MAX_ROWS);
    let (cols, c_loss) = build_axis(&outline.columns, MAX_COLS);
    SheetOutlinePlan { rows, cols, losses: r_loss + c_loss }
}
