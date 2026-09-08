//! 更新指向被编辑工作表的显式引用；普通值与无关公式不参与重装。
use super::*;

impl Sheet {
    pub(crate) fn retarget_sheet_references(
        &mut self,
        target: &str,
        edit: crate::shift::ShiftEdit,
    ) {
        let parsed: Vec<_> = self
            .interior
            .formula_exprs
            .borrow()
            .iter()
            .filter_map(|(addr, old)| {
                let mut expr = (**old).clone();
                crate::shift::rewrite_structural_refs(&mut expr, target, false, edit)
                    .then_some((*addr, expr))
            })
            .collect();
        let parked: Vec<_> = self
            .interior
            .formula_source
            .borrow()
            .iter()
            .filter_map(|(addr, old)| {
                crate::shift::rewrite_qualified_source(old.source.as_ref(), target, edit)
                    .map(|source| (addr, source))
            })
            .collect();
        if parsed.is_empty() && parked.is_empty() {
            return;
        }
        self.with_structural_edit(|sheet| {
            for (addr, expr) in parsed {
                sheet.install_retargeted_formula(addr, expr);
            }
            for (addr, source) in parked {
                sheet
                    .interior
                    .formula_source
                    .borrow_mut()
                    .insert(addr, ParkedFormula::new(source));
                sheet.invalidate_formula_value(addr);
            }
        });
    }
}
