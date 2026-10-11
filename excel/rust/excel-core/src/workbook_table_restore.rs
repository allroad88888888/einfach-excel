//! workbook table restore operations.

use super::*;

impl Workbook {
    pub fn restore_tables(&mut self, snapshot: TableRegistrySnapshot) -> Result<usize, TableError> {
        if self.is_inside_custom_call() {
            return Err(TableError::MutationDuringCustomCall);
        }
        if snapshot.entries.len() > MAX_TABLES {
            return Err(TableError::TooManyTables);
        }

        // Phase 1 — validate into a candidate map. Nothing on `self` is
        // touched until every entry has passed.
        let mut next: BTreeMap<String, TableEntry> = BTreeMap::new();
        for entry in snapshot.entries {
            let name = entry.canonical_name.as_str();
            if Self::validate_name(name).is_err() {
                return Err(TableError::InvalidName);
            }
            let key = name.to_ascii_uppercase();
            if is_builtin_function_name(&key) {
                return Err(TableError::ReservedName);
            }
            if name_is_cell_ref_like(name) {
                return Err(TableError::NameLikeCellRef);
            }
            // Shared namespace, evaluated against the CURRENT defined
            // names — a name that became a defined name after the snapshot
            // was taken must not be re-claimed behind its back.
            if self.named_values.contains_key(&key) {
                return Err(TableError::NameConflict);
            }
            if next.contains_key(&key) {
                return Err(TableError::NameConflict);
            }

            let range = entry.range.normalize();
            if entry.columns.len() as u32 != range.cols()
                || (entry.insert_row && range.rows()
                    != 1 + u32::from(entry.has_headers) + u32::from(entry.has_totals))
                || (!entry.calculated_columns.is_empty()
                    && entry.calculated_columns.len() != entry.columns.len()) {
                return Err(TableError::MalformedSnapshot);
            }
            if next
                .values()
                .any(|t| t.sheet_name == entry.sheet_name && ranges_overlap(t.range, range))
            {
                return Err(TableError::RangeOverlap);
            }

            next.insert(
                key,
                TableEntry {
                    canonical_name: entry.canonical_name,
                    sheet_name: entry.sheet_name,
                    range,
                    has_headers: entry.has_headers,
                    has_totals: entry.has_totals,
                    insert_row: entry.insert_row,
                    columns: entry.columns,
                    style: entry.style,
                    calculated_columns: entry.calculated_columns,
                    auto_filter: entry.auto_filter,
                },
            );
        }

        // Phase 2 — swap, and broadcast only if the registry really moved.
        let count = next.len();
        if next == self.tables {
            return Ok(count);
        }
        self.tables = next;
        self.bump_tables_epoch();
        Ok(count)
    }
}
