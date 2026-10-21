//! 跨表引用只重写公式目录；普通结构位移仍由 Sheet 移动范围与本表裸引用。
use super::*;
use crate::shift::{rewrite_structural_refs, ShiftEdit};

impl Workbook {
    /// 结构历史只补实际会被改写的其它表目录；目标表已有自己的目录快照。
    pub(crate) fn validation_reference_sheets(&self, target: usize, edit: ShiftEdit) -> Vec<usize> {
        let Some(name) = self.name(target) else {
            return Vec::new();
        };
        self.sheets
            .iter()
            .enumerate()
            .filter_map(|(owner, sheet)| {
                (owner != target
                    && sheet.data_validations.iter().any(|entry| {
                        if let DataValidationKind::CustomFormula { formula, .. } = &entry.rule.kind
                        {
                            rewritten(formula, name, edit).is_some()
                        } else {
                            false
                        }
                    }))
                .then_some(owner)
            })
            .collect()
    }

    /// 在本表位移之后调用；same_sheet=false 避免重复移动裸引用。
    pub(crate) fn retarget_validation_sheet_references(&mut self, target: usize, edit: ShiftEdit) {
        let Some(name) = self.name(target).map(str::to_owned) else {
            return;
        };
        for sheet in &mut self.sheets {
            for entry in &mut sheet.data_validations {
                if let DataValidationKind::CustomFormula { formula, .. } =
                    &mut Arc::make_mut(&mut entry.rule).kind
                {
                    if let Some(next) = rewritten(formula, &name, edit) {
                        *formula = next;
                    }
                }
            }
        }
    }
}

fn rewritten(formula: &str, sheet: &str, edit: ShiftEdit) -> Option<String> {
    let mut expression = parse_formula(formula)?;
    rewrite_structural_refs(&mut expression, sheet, false, edit)
        .then(|| crate::render_formula(&expression))
}
