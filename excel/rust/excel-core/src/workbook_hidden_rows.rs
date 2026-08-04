//! workbook hidden rows operations.

use super::*;

impl Workbook {
    pub fn set_eval_hidden_rows(&mut self, sheet_index: usize, rows: &[u32]) {
        if self.is_inside_custom_call() {
            return;
        }
        let Some(sheet) = self.sheets.get_mut(sheet_index) else {
            return;
        };
        sheet.replace_hidden_rows(rows.iter().copied().collect());
        self.republish_hidden(sheet_index);
    }

    /// Mark `rows` (0-based) hidden on `sheet_index`, additively. Returns
    /// whether anything changed; `false` covers an out-of-range sheet, an
    /// empty request, rows that were already hidden, and a call refused by
    /// the custom-call re-entrancy guard.
    pub fn hide_rows(&mut self, sheet_index: usize, rows: &[u32]) -> bool {
        self.mutate_hidden_rows(sheet_index, |sheet| sheet.hide_rows(rows))
    }

    /// Un-hide `rows` (0-based) on `sheet_index`. Rows that were not hidden
    /// are ignored. Returns whether anything changed.
    pub fn unhide_rows(&mut self, sheet_index: usize, rows: &[u32]) -> bool {
        self.mutate_hidden_rows(sheet_index, |sheet| sheet.unhide_rows(rows))
    }

    /// The manually hidden rows on `sheet_index`, ascending. Empty for an
    /// out-of-range sheet — a missing sheet hides nothing, which is the same
    /// "no filtering" signal an absent mirror entry carries.
    pub fn list_hidden_rows(&self, sheet_index: usize) -> Vec<u32> {
        self.sheets
            .get(sheet_index)
            .map(Sheet::hidden_rows)
            .unwrap_or_default()
    }

    /// Shared body of `hide_rows` / `unhide_rows`: guard, mutate the owned
    /// set, republish only if it moved.
    fn mutate_hidden_rows(
        &mut self,
        sheet_index: usize,
        mutate: impl FnOnce(&mut Sheet) -> bool,
    ) -> bool {
        if self.is_inside_custom_call() {
            return false;
        }
        let Some(sheet) = self.sheets.get_mut(sheet_index) else {
            return false;
        };
        if !mutate(sheet) {
            return false;
        }
        self.republish_hidden(sheet_index);
        true
    }

    /// Copy one sheet's owned hidden sets into the evaluation mirrors. THE
    /// only writer of either mirror (design §2.1). Manual at E2, filter as
    /// well since E3.
    ///
    /// Call sites are finite and enumerable: the two host push ports,
    /// `hide_rows` / `unhide_rows`, `apply_filter` / `reapply_filter` /
    /// `clear_filter`, the structural-shift wrappers, `restore_hidden` /
    /// `restore_filters`, and the sheet-lifecycle reconciliation in
    /// `republish_hidden_all`. Cheap and idempotent — both publishers
    /// compare before they write, so republishing unchanged sets costs two
    /// set comparisons and fires no epoch.
    ///
    /// The two halves are judged INDEPENDENTLY (§3), which is what keeps the
    /// #27 two-epoch split worth having: a manual hide must not dirty the
    /// `SUBTOTAL(1-11)` formulas that hold only the filter edge, and vice
    /// versa.
    pub(crate) fn republish_hidden(&self, sheet_index: usize) {
        let Some(sheet) = self.sheets.get(sheet_index) else {
            return;
        };
        let manual: HashSet<u32> = sheet.hidden_row_set().iter().copied().collect();
        self.atom_context
            .publish_eval_hidden_rows(sheet_index, manual);
        let filtered: HashSet<u32> = sheet
            .filter_hidden_set()
            .map(|set| set.iter().copied().collect())
            .unwrap_or_default();
        self.atom_context
            .publish_eval_filter_hidden_rows(sheet_index, filtered);
    }

    /// Reconcile the whole mirror against the sheet vector. Used after a
    /// topology change (`remove_sheet` / `move_sheet`), where the mirror has
    /// just been re-keyed to follow the same rotation the sheet vector
    /// underwent: this re-asserts the outcome from the owning side rather
    /// than trusting two independent index remaps to agree forever, and drops
    /// any entry left keyed past the end of the vector.
    ///
    /// Costs nothing when they already agree — every comparison short-
    /// circuits and no epoch fires.
    pub(crate) fn republish_hidden_all(&self) {
        self.atom_context
            .drop_eval_hidden_rows_above(self.sheets.len());
        self.atom_context
            .drop_eval_filter_hidden_rows_above(self.sheets.len());
        for sheet_index in 0..self.sheets.len() {
            self.republish_hidden(sheet_index);
        }
    }

    /// Capture every sheet's manually hidden rows (see [`HiddenRowsSnapshot`]
    /// for why this is REPLACE rather than additive). Pure read — no epoch
    /// bump, no reactive traffic. Sheets with nothing hidden are omitted.
    ///
    /// A host undo transaction records `snapshot_hidden()` as the
    /// before-image, applies the mutation, and calls `restore_hidden(before)`
    /// to undo — the same shape `snapshot_tables` / `restore_tables` already
    /// document.
    pub fn snapshot_hidden(&self) -> HiddenRowsSnapshot {
        HiddenRowsSnapshot::from_sheets(
            self.sheets
                .iter()
                .enumerate()
                .filter(|(_, sheet)| !sheet.hidden_row_set().is_empty())
                .map(|(sheet_index, sheet)| SheetHiddenRows {
                    sheet_index,
                    rows: sheet.hidden_rows(),
                })
                .collect(),
        )
    }

    /// Replace every sheet's manually hidden rows with `snapshot`, returning
    /// the number of sheets that ended up with at least one hidden row.
    ///
    /// REPLACE across the WHOLE workbook: a sheet the snapshot does not
    /// mention is cleared, not left alone. That is what makes an undo of
    /// "hide rows on a previously-unhidden sheet" symmetric.
    ///
    /// Entries whose `sheet_index` is past the end of the sheet vector are
    /// dropped silently — the snapshot may have been captured against a wider
    /// workbook, and refusing the whole transaction over a sheet that no
    /// longer exists would make the primitive one-directional. (The Table
    /// registry keeps such entries instead, because it anchors by NAME and a
    /// deleted sheet can come back under the same name; an index cannot be
    /// resurrected meaningfully.)
    ///
    /// Epochs fire per sheet and only where the set actually moved, so a
    /// restore that reproduces the current state costs no recompute — which
    /// matters because a host that snapshots hidden state in every undo
    /// transaction will restore identical state most of the time.
    pub fn restore_hidden(&mut self, snapshot: HiddenRowsSnapshot) -> Result<u32, HiddenRowsError> {
        if self.is_inside_custom_call() {
            return Err(HiddenRowsError::MutationDuringCustomCall);
        }
        let sheet_count = self.sheets.len();
        let mut wanted: Vec<BTreeSet<u32>> = vec![BTreeSet::new(); sheet_count];
        for entry in snapshot.sheets() {
            if entry.sheet_index >= sheet_count {
                continue; // captured against a wider workbook
            }
            wanted[entry.sheet_index].extend(entry.rows.iter().copied());
        }
        let mut restored = 0u32;
        for (sheet_index, rows) in wanted.into_iter().enumerate() {
            if !rows.is_empty() {
                restored += 1;
            }
            if self.sheets[sheet_index].replace_hidden_rows(rows) {
                self.republish_hidden(sheet_index);
            }
        }
        Ok(restored)
    }
}
