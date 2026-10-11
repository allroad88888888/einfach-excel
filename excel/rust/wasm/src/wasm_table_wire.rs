#[derive(Clone, Debug, Serialize, Deserialize)]
struct TableJSON {
    name: String,
    sheet: String,
    #[serde(rename = "sheetIndex", default)]
    sheet_index: u32,
    range: String,
    #[serde(rename = "hasHeaders", default)]
    has_headers: bool,
    #[serde(rename = "hasTotals", default)]
    has_totals: bool,
    #[serde(rename = "insertRow", default, skip_serializing_if = "is_false")]
    insert_row: bool,
    #[serde(default)]
    columns: Vec<String>,
    #[serde(default)]
    style: einfach_excel_core::TableStyle,
    #[serde(rename = "calculatedColumns", default, skip_serializing_if = "Vec::is_empty")]
    calculated_columns: Vec<Option<einfach_excel_core::TableColumnFormula>>,
    #[serde(rename = "autoFilter", default, skip_serializing_if = "Option::is_none")]
    auto_filter: Option<TableFilterJSON>,
}

/// Table 范围来自定义；只保存条件与上次扫描快照，不再复制一份范围。
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct TableFilterJSON {
    rules: Vec<ColumnFilterRuleJSON>,
    #[serde(rename = "hiddenRows", default, skip_serializing_if = "Vec::is_empty")]
    hidden_rows: Vec<u32>,
}

impl TableJSON {
    fn from_entry(entry: &TableEntry, sheet_index: u32) -> Self {
        Self::from_entry_with_filter_rows(entry, sheet_index, true)
    }

    /// 保存需要隐藏快照；只读 UI 投影只需要条件，可见行由窗口投影统一返回。
    fn from_entry_with_filter_rows(entry: &TableEntry, sheet_index: u32, snapshot: bool) -> Self {
        let range = entry.range();
        TableJSON {
            name: entry.name().to_string(),
            sheet: entry.sheet_name().to_string(),
            sheet_index,
            range: format!(
                "{}:{}",
                range.start.to_string_repr(),
                range.end.to_string_repr()
            ),
            has_headers: entry.has_headers(),
            has_totals: entry.has_totals(),
            insert_row: entry.has_insert_row(),
            columns: entry.columns().to_vec(),
            style: entry.style(),
            calculated_columns: entry.calculated_columns().to_vec(),
            auto_filter: entry.auto_filter().map(|filter| TableFilterJSON {
                rules: filter.rules().iter().map(ColumnFilterRuleJSON::from_rule).collect(),
                hidden_rows: if snapshot { filter.hidden_rows() } else { Vec::new() },
            }),
        }
    }

    /// Rehydrate a snapshot entry. The `range` is the same `"A1:C10"` form
    /// `from_entry` emits; a bare `"A1"` degenerates to a 1x1 range, matching
    /// `SortRangeWireJSON`. Shape checks beyond parsing (column count vs
    /// range width, name mutex, cap) belong to `Workbook::restore_tables`,
    /// which validates the batch atomically.
    fn into_entry(self) -> Result<TableEntry, String> {
        let (a, b) = self
            .range
            .split_once(':')
            .unwrap_or((self.range.as_str(), self.range.as_str()));
        let start =
            CellAddress::parse(a.trim()).ok_or_else(|| format!("invalid table range cell: {a}"))?;
        let end =
            CellAddress::parse(b.trim()).ok_or_else(|| format!("invalid table range cell: {b}"))?;
        let entry = TableEntry::from_parts(
            self.name,
            self.sheet,
            CellRange::new(start, end),
            self.has_headers,
            self.has_totals,
            self.columns,
        ).with_insert_row(self.insert_row).with_style(self.style)
            .with_calculated_columns(self.calculated_columns);
        Ok(match self.auto_filter {
            Some(filter) => entry.with_filter(
                filter.rules.into_iter().map(ColumnFilterRuleJSON::into_rule).collect(), filter.hidden_rows),
            None => entry,
        })
    }
}

/// Envelope for `snapshotTables` / `restoreTables`. Versioned like the
/// persistence-v1 payload so a stored undo record can be rejected loudly
/// rather than silently half-applied, and so the shape stays distinguishable
/// from the bare `TableJSON[]` that `listTables` returns.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct TableRegistrySnapshotJSON {
    version: u32,
    tables: Vec<TableJSON>,
}

// === Engine-owned MANUAL hidden rows wire (E2 of
// `design-engine-hidden-rows.md`) ===

/// One sheet's manually hidden rows. Element of both the
/// `snapshotHidden` / `restoreHidden` undo envelope and the persistence-v1
/// `hidden` field, so the two agree by construction.
///
/// Keyed by sheet INDEX, unlike `TableJSON`'s sheet NAME: hidden rows are
/// per-`Sheet` dimension metadata that rides `moveSheet` automatically, and
/// every other per-sheet persistence payload here (`FormatRangeSnapshotJSON`,
/// `ViewportSizeSnapshotJSON`) is already index-keyed.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct SheetHiddenRowsJSON {
    sheet: u32,
    rows: Vec<u32>,
}

impl SheetHiddenRowsJSON {
    fn from_entry(entry: &SheetHiddenRows) -> Self {
        SheetHiddenRowsJSON {
            sheet: entry.sheet_index as u32,
            rows: entry.rows.clone(),
        }
    }

    fn into_entry(self) -> SheetHiddenRows {
        SheetHiddenRows {
            sheet_index: self.sheet as usize,
            rows: self.rows,
        }
    }
}

/// Envelope for `snapshotHidden` / `restoreHidden`. Versioned exactly like
/// `TableRegistrySnapshotJSON`, so a stored undo record from a future shape
/// is rejected loudly rather than half-applied.
#[derive(Clone, Debug, Serialize, Deserialize)]
struct HiddenRowsSnapshotJSON {
    version: u32,
    hidden: Vec<SheetHiddenRowsJSON>,
}

// === Engine-owned FILTER wire (E3 of `design-engine-hidden-rows.md`) ===
//
// `ColumnFilterRuleJSON` is the Rust twin of the TypeScript wire union
// `ColumnFilterRule` (`spreadsheet-ui-core/src/filter-sort/types.ts:12-16`),
// which is the ONE piece of predicate knowledge UI-core keeps after E4. The
// shape is copied field for field so a host can pass its existing rule
// objects straight through with no adapter mapping:
//
//   { kind: 'equals'   | 'contains', colIndex, value, caseSensitive? }
//   { kind: 'range',    colIndex, min?, max? }
//   { kind: 'list',     colIndex, values }
//
// `caseSensitive` is optional on the wire and absent means `false`, which is
// what the TypeScript predicate does (`caseSensitive ? value : lower(value)`).

// One column filter rule, internally tagged by `kind` exactly like the
// TypeScript union.
