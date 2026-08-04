//! workbook sheet removal operations.

use super::*;

impl Workbook {
    pub fn remove_sheet(&mut self, idx: usize) -> Option<Sheet> {
        if self.is_inside_custom_call() {
            return None; // re-entrancy guard
        }
        if idx >= self.sheets.len() {
            return None;
        }
        let sheet = self.sheets.remove(idx);
        sheet.detach_workbook_context();
        let name = self.names.remove(idx);
        self.by_name.remove(&name);
        // Table anchor maintenance (design doc #32 §4.4): drop every Table
        // anchored to the removed sheet. Formulas on OTHER sheets that
        // referenced those Tables surface `#NAME?` at eval time (T3);
        // recovering the Tables on a deleteSheet-undo is a host-replay
        // concern (§12), out of this slice.
        let before = self.tables.len();
        self.tables.retain(|_, t| t.sheet_name != name);
        if self.tables.len() != before {
            self.bump_tables_epoch();
        }
        // Hidden-row maintenance: the Table registry above is keyed by NAME and
        // so is immune to the index shift, but the two hidden-row side stores
        // are keyed by sheet INDEX and must be shifted down explicitly, or
        // SUBTOTAL 1-11 / 101-111 start filtering against another sheet's rows.
        self.atom_context.remap_hidden_rows_after_sheet_remove(idx);
        self.rebuild_name_lookup();
        self.sync_atom_topology();
        // The MANUAL half is engine-owned since E2 and rides the `Sheet` that
        // just moved, so re-assert the mirror from the owning side (and drop
        // the now-out-of-range top key). No-ops when the remap above already
        // produced the same answer, which it should.
        self.republish_hidden_all();
        Some(sheet)
    }
}
