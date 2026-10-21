//! 条件范围及公式引用随行列插删位移；不枚举规则覆盖的单元格。
use super::*;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::{
    render_formula, rewrite_structural_refs, shift_copy_formula, shift_interval, ShiftEdit,
};
use super::advanced_conditional_format::rewrite_rule_formulas;

impl Workbook {
    pub(super) fn shifted_conditional_format_rules(
        &self,
        owner: usize,
        target: usize,
        edit: ShiftEdit,
    ) -> Vec<ConditionalFormatRuleEntry> {
        let (at, count, insert) = match edit {
            ShiftEdit::RowInsert { at, count } | ShiftEdit::ColInsert { at, count } => {
                (at, count, true)
            }
            ShiftEdit::RowDelete { at, count } | ShiftEdit::ColDelete { at, count } => {
                (at, count, false)
            }
        };
        self.conditional_formats[owner]
            .rules
            .iter()
            .filter_map(|entry| {
                let mut next = entry.clone();
                let mut origin_delta = (0, 0);
                if owner == target {
                    let mut ranges = Vec::new();
                    for mut area in entry.ranges() {
                        let mut survivor = area.start;
                        let (lo, hi, limit) = if edit.is_row_edit() {
                            (&mut area.start.row, &mut area.end.row, EXCEL_MAX_ROWS)
                        } else {
                            (&mut area.start.col, &mut area.end.col, EXCEL_MAX_COLS)
                        };
                        let Some(shifted) = shift_interval(*lo, *hi, at, count, insert, limit) else { continue; };
                        if !insert && *lo >= at && *lo < at.saturating_add(count) {
                            if edit.is_row_edit() { survivor.row = at.saturating_add(count); }
                            else { survivor.col = at.saturating_add(count); }
                        }
                        // 首区被删光时，以第一个幸存区域的旧坐标重定公式原点。
                        if ranges.is_empty() {
                            origin_delta = (i64::from(survivor.row) - i64::from(entry.row_start),
                                i64::from(survivor.col) - i64::from(entry.col_start));
                        }
                        (*lo, *hi) = shifted;
                        ranges.push(area);
                    }
                    if ranges.is_empty() { return None; }
                    next.set_ranges(ranges);
                }
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&entry.rule_json) {
                    let changed = rewrite_rule_formulas(&mut json, |text| {
                        if let Some(mut expr) = parse_formula(text) {
                            if origin_delta != (0, 0) {
                                let Ok(shifted) = shift_copy_formula(
                                    &expr,
                                    origin_delta.0,
                                    origin_delta.1,
                                ) else {
                                    // 不支持的旧 AST 仍保留原文，不能因显示原点改变就丢掉规则。
                                    return None;
                                };
                                expr = shifted;
                            }
                            let changed = rewrite_structural_refs(
                                &mut expr,
                                &self.names[target],
                                owner == target,
                                edit,
                            );
                            if changed || origin_delta != (0, 0) {
                                return Some(render_formula(&expr));
                            }
                        }
                        None
                    });
                    if changed { next.rule_json = json.to_string(); }
                }
                Some(next)
            })
            .collect()
    }

    /// 必须在结构写入之前检查，修订号耗尽不能留下只移动了单元格的半次操作。
    pub(super) fn validate_conditional_format_shift(
        &self,
        sheet: usize,
        edit: ShiftEdit,
    ) -> Result<(), &'static str> {
        for (owner, config) in self.conditional_formats.iter().enumerate() {
            if config.revision == u64::MAX
                && config.rules != self.shifted_conditional_format_rules(owner, sheet, edit)
            {
                return Err("Conditional-format revision is exhausted.");
            }
        }
        Ok(())
    }
}
