//! 原生大纲：只存区间与折叠标志，不把隐藏状态写进单元格。
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use serde::{Deserialize, Serialize};

pub const MAX_OUTLINE_DEPTH: usize = 8;
pub const MAX_OUTLINE_GROUPS: usize = 4096;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum OutlineAxis {
    Row,
    Column,
}

impl OutlineAxis {
    pub fn limit(self) -> u32 {
        match self {
            Self::Row => EXCEL_MAX_ROWS,
            Self::Column => EXCEL_MAX_COLS,
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OutlineGroup {
    pub start: u32,
    pub end: u32,
    pub collapsed: bool,
}

/// 顺序固定为外层在前；相同范围按原有顺序表示嵌套，无需额外 ID。
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SheetOutline {
    pub rows: Vec<OutlineGroup>,
    pub columns: Vec<OutlineGroup>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "kebab-case", deny_unknown_fields)]
pub enum OutlineAction {
    Group { start: u32, end: u32 },
    Ungroup { start: u32, end: u32 },
    SetCollapsed { index: usize, collapsed: bool },
    ShowLevel { level: usize },
}

impl SheetOutline {
    pub fn groups(&self, axis: OutlineAxis) -> &[OutlineGroup] {
        match axis {
            OutlineAxis::Row => &self.rows,
            OutlineAxis::Column => &self.columns,
        }
    }

    pub(crate) fn groups_mut(&mut self, axis: OutlineAxis) -> &mut Vec<OutlineGroup> {
        match axis {
            OutlineAxis::Row => &mut self.rows,
            OutlineAxis::Column => &mut self.columns,
        }
    }

    /// 栈只保留祖先；嵌套校验 O(n)，不按总行数逐行分配元数据。
    pub fn levels(&self, axis: OutlineAxis) -> Result<Vec<usize>, &'static str> {
        let groups = self.groups(axis);
        if groups.len() > MAX_OUTLINE_GROUPS {
            return Err("Too many outline groups.");
        }
        let mut stack: Vec<&OutlineGroup> = Vec::new();
        let mut levels = Vec::with_capacity(groups.len());
        let mut previous: Option<&OutlineGroup> = None;
        for group in groups {
            validate_range(axis, group.start, group.end)?;
            if previous.is_some_and(|p| {
                p.start > group.start || (p.start == group.start && p.end < group.end)
            }) {
                return Err("Outline groups must be ordered outermost first.");
            }
            while stack.last().is_some_and(|p| p.end < group.start) {
                stack.pop();
            }
            if stack.last().is_some_and(|p| p.end < group.end) {
                return Err("Outline groups must be separate or nested, not partially overlap.");
            }
            stack.push(group);
            if stack.len() > MAX_OUTLINE_DEPTH {
                return Err("Outline supports at most eight nested groups.");
            }
            levels.push(stack.len());
            previous = Some(group);
        }
        Ok(levels)
    }

    pub fn validate(&self) -> Result<(), &'static str> {
        self.levels(OutlineAxis::Row)?;
        self.levels(OutlineAxis::Column)?;
        Ok(())
    }

    /// 先在副本上完成校验，失败不动工作表或 redo 栈。
    pub fn changed(&self, axis: OutlineAxis, action: OutlineAction) -> Result<Self, &'static str> {
        let levels = self.levels(axis)?;
        let mut next = self.clone();
        let groups = next.groups_mut(axis);
        match action {
            OutlineAction::Group { start, end } => {
                validate_range(axis, start, end)?;
                groups.push(OutlineGroup {
                    start,
                    end,
                    collapsed: false,
                });
                groups.sort_by_key(|g| (g.start, std::cmp::Reverse(g.end)));
            }
            OutlineAction::Ungroup { start, end } => {
                validate_range(axis, start, end)?;
                // 每次只剥去选中范围里最内层的组，父组仍保留。
                let selected: Vec<_> = groups
                    .iter()
                    .enumerate()
                    .filter(|(_, g)| start <= g.start && g.end <= end)
                    .map(|(i, _)| i)
                    .collect();
                let remove: Vec<_> = selected
                    .iter()
                    .copied()
                    .filter(|&i| {
                        !selected
                            .iter()
                            .any(|&j| j > i && groups[j].end <= groups[i].end)
                    })
                    .collect();
                let mut index = 0;
                groups.retain(|_| {
                    let keep = !remove.contains(&index);
                    index += 1;
                    keep
                });
            }
            OutlineAction::SetCollapsed { index, collapsed } => {
                groups
                    .get_mut(index)
                    .ok_or("The outline group no longer exists.")?
                    .collapsed = collapsed;
            }
            OutlineAction::ShowLevel { level } => {
                if !(1..=MAX_OUTLINE_DEPTH + 1).contains(&level) {
                    return Err("Invalid outline level.");
                }
                for (group, depth) in groups.iter_mut().zip(levels) {
                    group.collapsed = depth >= level;
                }
            }
        }
        next.validate()?;
        Ok(next)
    }

    pub fn is_hidden(&self, axis: OutlineAxis, index: u32) -> bool {
        self.groups(axis).iter().any(|g| g.collapsed && g.start <= index && index <= g.end)
    }

    /// 嵌套折叠只输出一次索引；父组展开后，已折叠子组仍保持隐藏。
    pub fn hidden_indices(&self, axis: OutlineAxis) -> impl Iterator<Item = u32> + '_ {
        let mut covered_end: Option<u32> = None;
        self.groups(axis)
            .iter()
            .filter(|g| g.collapsed)
            .filter_map(move |g| {
                let start = covered_end.map_or(g.start, |end| g.start.max(end + 1));
                covered_end = Some(covered_end.map_or(g.end, |end| end.max(g.end)));
                (start <= g.end).then_some(start..=g.end)
            })
            .flatten()
    }
}

fn validate_range(axis: OutlineAxis, start: u32, end: u32) -> Result<(), &'static str> {
    if start > end || end >= axis.limit() {
        Err("Invalid outline range.")
    } else {
        Ok(())
    }
}
