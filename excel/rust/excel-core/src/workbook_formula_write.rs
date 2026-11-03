//! Formula installation keeps cycle/spill bookkeeping shared by edits and native source rewrites.
use super::*;

impl Workbook {
    pub fn set_formula(&mut self, sheet_idx: usize, addr_str: &str, formula_text: &str) -> bool {
        if self.is_inside_custom_call() || sheet_idx >= self.sheets.len() {
            return false;
        }
        let Some(addr) = CellAddress::parse(addr_str) else { return false };
        if self.ensure_range_editable(sheet_idx, CellRange::single(addr)).is_err() {
            return false;
        }
        let rows = self.insert_rows_for_writes([(sheet_idx, addr)]);
        if !rows.is_empty() && self.ensure_workbook_unprotected().is_err() { return false; }
        self.write_with_insert_rows(rows, |book| {
            book.install_formula_source(sheet_idx, addr, formula_text)
        })
    }

    /// Engine-owned formula installation after caller preflight. Topology rewrites an existing
    /// reference even in locked cells; it does not authorize a user edit or expand a Table.
    pub(super) fn install_formula_source(
        &mut self,
        sheet_idx: usize,
        addr: CellAddress,
        formula_text: &str,
    ) -> bool {
        let array_dependents = self.cross_sheet_array_dependents_for_addr(sheet_idx, addr);
        let addr_str = addr.to_string_repr();
        let expr = match parse_formula(formula_text) {
            Some(expr) => expr,
            None => {
                self.cyclic_formulas.remove(&(sheet_idx, addr));
                self.sheets[sheet_idx].set_formula(&addr_str, formula_text);
                self.recompute_array_formula_groups(array_dependents);
                return false;
            }
        };
        if self.closes_workbook_cycle(sheet_idx, addr, &expr) {
            if self.iterative_calculation.enabled {
                self.cyclic_formulas.remove(&(sheet_idx, addr));
                self.atom_context.mark_installed_cycles();
            } else {
                self.cyclic_formulas.insert((sheet_idx, addr), formula_text.to_string());
                self.sheets[sheet_idx].write_error(addr, ValueError::CyclicRef);
                self.recompute_array_formula_groups(array_dependents);
                return false;
            }
        } else {
            self.cyclic_formulas.remove(&(sheet_idx, addr));
        }
        let ok = self.sheets[sheet_idx].set_formula(&addr_str, formula_text);
        self.recompute_array_formula_groups(array_dependents);
        ok
    }
}
