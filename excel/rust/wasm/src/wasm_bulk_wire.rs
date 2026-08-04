/// `Array<[addr, PrimitiveWire]>` → `HashMap<CellAddress, Value>` in one
/// deserialize pass. Skippable entries (null / non-finite numbers) are
/// dropped here; malformed addresses fail the whole call (the payload
/// is machine-built by the worker — fail fast beats silent data loss).
#[derive(Default)]
struct PrimitivePairsJSON(HashMap<CellAddress, Value>);

impl<'de> Deserialize<'de> for PrimitivePairsJSON {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = PrimitivePairsJSON;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an array of [addr, primitive] pairs")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: de::SeqAccess<'de>,
            {
                let mut map: HashMap<CellAddress, Value> =
                    HashMap::with_capacity(seq.size_hint().unwrap_or(0));
                while let Some((addr, wire)) = seq.next_element::<(String, PrimitiveWireJSON)>()? {
                    let Some(addr) = parse_wire_addr(&addr) else {
                        return Err(de::Error::custom(format!("invalid cell address: {addr}")));
                    };
                    if let Some(value) = wire.into_value() {
                        map.insert(addr, value);
                    }
                }
                Ok(PrimitivePairsJSON(map))
            }
        }

        deserializer.deserialize_seq(Visitor)
    }
}

/// `Array<[addr, source]>` → `HashMap<CellAddress, String>`. Source text
/// is NOT parse-validated here — that's the storage-primary contract;
/// unparseable text surfaces `#VALUE!` at first read via the hydrator.
#[derive(Default)]
struct FormulaPairsJSON(HashMap<CellAddress, String>);

impl<'de> Deserialize<'de> for FormulaPairsJSON {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: de::Deserializer<'de>,
    {
        struct Visitor;

        impl<'de> de::Visitor<'de> for Visitor {
            type Value = FormulaPairsJSON;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("an array of [addr, formula-source] pairs")
            }

            fn visit_seq<A>(self, mut seq: A) -> Result<Self::Value, A::Error>
            where
                A: de::SeqAccess<'de>,
            {
                let mut map: HashMap<CellAddress, String> =
                    HashMap::with_capacity(seq.size_hint().unwrap_or(0));
                while let Some((addr, source)) = seq.next_element::<(String, String)>()? {
                    let Some(addr) = parse_wire_addr(&addr) else {
                        return Err(de::Error::custom(format!("invalid cell address: {addr}")));
                    };
                    map.insert(addr, source);
                }
                Ok(FormulaPairsJSON(map))
            }
        }

        deserializer.deserialize_seq(Visitor)
    }
}

/// One sheet's storage-primary payload.
#[derive(Deserialize)]
struct SheetBulkInstallJSON {
    sheet: usize,
    #[serde(default)]
    primitives: PrimitivePairsJSON,
    #[serde(default)]
    formulas: FormulaPairsJSON,
}

/// Per-sheet stats returned by `bulk_install_workbook`.
#[derive(Clone, Copy, Debug, Serialize)]
struct BulkInstallStatsJSON {
    sheet: usize,
    #[serde(rename = "primitivesInstalled")]
    primitives_installed: u32,
    #[serde(rename = "formulasInstalled")]
    formulas_installed: u32,
    #[serde(rename = "crossSheetParsed")]
    cross_sheet_parsed: u32,
}

#[derive(Clone, Debug, Serialize)]
struct CellRefJSON {
    sheet: usize,
    addr: String,
}

/// Phase 1 dep-graph statistics wire shape. Mirrors
/// `einfach_excel_core::DepGraphStats` summed across all sheets plus
/// the derived `avg_fanout` computed here so the JS bench doesn't have
/// to divide on its side.
#[derive(Clone, Debug, Default, Serialize)]
struct DepGraphStatsJSON {
    #[serde(rename = "totalFormulaCount")]
    total_formula_count: u64,
    #[serde(rename = "totalPointDepEdges")]
    total_point_dep_edges: u64,
    #[serde(rename = "totalRangeDepEntries")]
    total_range_dep_entries: u64,
    #[serde(rename = "maxFanout")]
    max_fanout: u32,
    #[serde(rename = "avgFanout")]
    avg_fanout: f64,
    #[serde(rename = "rangeFormulaCount")]
    range_formula_count: u64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct SparseCellJSON {
    sheet: usize,
    addr: String,
    row: u32,
    col: u32,
    kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    value: Option<ImportValueJSON>,
}

#[derive(Clone, Debug, Serialize)]
struct CellSnapshotJSON {
    sheet: usize,
    addr: String,
    display: String,
    #[serde(rename = "type")]
    cell_type: String,
    #[serde(rename = "isError")]
    is_error: bool,
    formula: String,
}

/// 表元数据 = 表身份，**仅此而已**：`{ idx, name }` 就是 `restore_persistence_v1`
/// 会读的全部内容（它按 idx 校验连续、按 name 建表）。
///
/// 曾经这里还有 `rowCount` / `colCount`（由 `sheet_sparse_bounds` 扫全表填出）。
/// 它们是**纯写不读**的：restore 侧一行都没碰过，TS 引擎压根不填，整个 TS 代码库
/// 零消费者。代价却是实打实的 —— 它是两个引擎的持久化快照永远无法逐字相等的唯一
/// 原因，把 scale-parity P5 的形状断言逼成了子集比对。2026-08-01 删除。
///
/// 想加回类似字段前先回答：谁读它？读不到会怎样？答不上来就别加 —— 只写不读的
/// 字段不会报错，只会静静腐坏。
#[derive(Clone, Debug, Serialize, Deserialize)]
struct WorkbookPersistenceSheetMetaJSON {
    idx: u32,
    name: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct WorkbookPersistenceV1JSON {
    version: u32,
    sheets: Vec<WorkbookPersistenceSheetMetaJSON>,
    cells: Vec<SparseCellJSON>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    formats: Vec<FormatRangeSnapshotJSON>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    sizes: Vec<ViewportSizeSnapshotJSON>,
    /// Excel Table registry (#32). `default` + `skip_serializing_if` keeps
    /// the wire backward-compatible in BOTH directions: payloads written
    /// before this field existed restore as "no Tables" (exactly today's
    /// behaviour), and a table-less workbook still serializes byte-identical
    /// to before. Included because `restore_persistence_v1` builds a FRESH
    /// `Workbook` — without the registry travelling with the payload, every
    /// restored workbook came back with its Tables silently gone and its
    /// structured references reading `#NAME?`, i.e. a lossy restore.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    tables: Vec<TableJSON>,
    /// Manually hidden rows, per sheet (E2 of `design-engine-hidden-rows.md`).
    /// Same `default` + `skip_serializing_if` backward-compatibility argument
    /// as `tables` above: payloads written before this field existed restore
    /// as "nothing hidden", and a workbook with nothing hidden still
    /// serializes byte-identical to before.
    ///
    /// Included because `restore_persistence_v1` builds a FRESH `Workbook`.
    /// Before the engine owned the set there was nothing on this side to
    /// serialize — the host's hidden state never reached the engine's
    /// snapshot at all — so every save/load round trip silently un-hid every
    /// row and changed every `SUBTOTAL(101-111)` that depended on one. That
    /// also closes an xlsx-parity gap: real workbooks persist hidden rows.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    hidden: Vec<SheetHiddenRowsJSON>,
    /// Per-sheet AutoFilter state — rules AND the rows they hid (E3 of
    /// `design-engine-hidden-rows.md`). Same `default` +
    /// `skip_serializing_if` backward-compatibility argument as `hidden`
    /// and `tables` above.
    ///
    /// Both halves are persisted for the same reason the undo snapshot
    /// carries both: restoring rules alone would force a re-derivation
    /// against whatever the restored cells say, which is exactly the
    /// liveness #27's snapshot semantics removed. Closes the other half of
    /// the xlsx-parity gap `hidden` opened — real workbooks persist their
    /// autoFilter state.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    filters: Vec<SheetFilterStateJSON>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct WorkbookPersistenceRestoreStatsJSON {
    restored_cells: u32,
    restored_formats: u32,
    sheets: u32,
    /// Excel Tables re-registered (#32). Additive output key — hosts that
    /// predate it simply ignore it.
    restored_tables: u32,
    /// Sheets that came back with at least one manually hidden row (E2).
    /// Additive output key, same as `restored_tables`.
    restored_hidden_sheets: u32,
    /// Sheets that came back with an AutoFilter (E3). Additive output key.
    restored_filter_sheets: u32,
}

// === Engine physical sort (`sortRange`) wire — S2 of
// `excel/solid-excel/docs/archive/online-excel-parity/design-engine-sort.md` ===
//
// Payload `{ range, keys: [{ col, direction, caseSensitive }], excludedRows }`.
// `range` is either an A1 string (`"A1:B3"`, or `"A1"` for a single cell) or a
// zero-based `{ startRow, startCol, endRow, endCol }` bounds object. Success
// serializes `SortRangeReportJSON` (`{ ok: true, movedRows, movedCells,
// rowPermutation }`); every rejection (engine gate OR payload parse) returns a
// structured `{ ok: false, code, anchor?, message? }` object in the Ok arm,
// matching the `trySetCell*` convention (`sheet_error_to_js`).

// Range wire: an A1 string or a zero-based bounds object.
