//! Table 历史按最终注册表校验：相邻表同时位移时，不能拿目标范围撞旧坐标。
use super::*;

impl TableDefinitionChange {
    pub(super) fn table_definitions(&self, undo: bool)
        -> impl Iterator<Item = (Option<&TableEntry>, Option<&TableEntry>)> {
        std::iter::once((Some(&self.before), self.after.as_ref()))
            .chain(self.shifted_tables.iter().map(|(before, after)| (Some(before), Some(after))))
            .map(move |(before, after)| if undo { (after, before) } else { (before, after) })
    }

    pub(super) fn validate_tables(&self, workbook: &Workbook, undo: bool) -> Result<(), &'static str> {
        if workbook.name(self.sheet) != Some(self.before.sheet_name()) {
            return Err("The table worksheet changed outside history.");
        }
        let definitions: Vec<_> = self.table_definitions(undo).collect();
        let old_keys: BTreeSet<_> = definitions.iter().filter_map(|(expected, _)|
            expected.map(|table| table.name().to_ascii_uppercase())).collect();
        let next_entries: Vec<_> = definitions.iter().filter_map(|(_, next)| *next).collect();
        for (expected, next) in &definitions {
            let lookup = expected.or(*next).expect("table history has a definition");
            if workbook.tables.get(&lookup.name().to_ascii_uppercase()) != *expected {
                return Err("The table changed outside history.");
            }
            if let Some(next) = next {
                let old_key = expected.map(|entry| entry.name().to_ascii_uppercase());
                workbook.validate_table_name(next.name(), old_key.as_deref())
                    .map_err(|_| "The table name is no longer available.")?;
            }
        }
        // 身份预检后才减掉旧条目数；外部删除不能导致 usize 下溢。
        if workbook.tables.len() - old_keys.len() + next_entries.len() > MAX_TABLES {
            return Err("The table registry capacity is no longer available.");
        }
        for (index, next) in next_entries.iter().enumerate() {
            let overlaps = |entry: &TableEntry| entry.sheet_name() == next.sheet_name()
                && entry.range().intersects(next.range());
            if workbook.tables.iter().any(|(key, entry)| !old_keys.contains(key) && overlaps(entry))
                || next_entries[..index].iter().any(|entry| overlaps(entry)) {
                return Err("The table range is no longer available.");
            }
        }
        Ok(())
    }
}
