//! 条件范围及公式引用随行列插删位移；不枚举规则覆盖的单元格。
use super::*;
use crate::sheet::{EXCEL_MAX_COLS, EXCEL_MAX_ROWS};
use crate::shift::{
    render_formula, rewrite_structural_refs, shift_copy_formula, shift_interval, ShiftEdit,
};

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
                let mut origin_delta = 0;
                if owner == target {
                    let (lo, hi, limit) = if edit.is_row_edit() {
                        (&mut next.row_start, &mut next.row_end, EXCEL_MAX_ROWS)
                    } else {
                        (&mut next.col_start, &mut next.col_end, EXCEL_MAX_COLS)
                    };
                    // 删除覆盖原点时，先按第一个幸存单元格平移相对公式，再处理引用删除。
                    if !insert && *lo >= at && *lo < at.saturating_add(count) {
                        origin_delta = i64::from(at.saturating_add(count) - *lo);
                    }
                    (*lo, *hi) = shift_interval(*lo, *hi, at, count, insert, limit)?;
                }
                if let Ok(mut json) = serde_json::from_str::<serde_json::Value>(&entry.rule_json) {
                    if json["kind"] == "formula" {
                        if let Some(mut expr) = json["formula"].as_str().and_then(parse_formula) {
                            if origin_delta != 0 {
                                let Ok(shifted) = shift_copy_formula(
                                    &expr,
                                    if edit.is_row_edit() { origin_delta } else { 0 },
                                    if edit.is_row_edit() { 0 } else { origin_delta },
                                ) else {
                                    // 不支持的旧 AST 仍保留原文，不能因显示原点改变就丢掉规则。
                                    return Some(next);
                                };
                                expr = shifted;
                            }
                            let changed = rewrite_structural_refs(
                                &mut expr,
                                &self.names[target],
                                owner == target,
                                edit,
                            );
                            if changed || origin_delta != 0 {
                                json["formula"] = serde_json::Value::String(render_formula(&expr));
                                next.rule_json = json.to_string();
                            }
                        }
                    }
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
