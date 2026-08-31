// === Engine physical sort (`sortRange`) wire — design-engine-sort S2/S3 ===

/**
 * One sort key. `col` is a 0-based ABSOLUTE column index that must fall
 * inside the sort range's column span. `direction` defaults to `'asc'`
 * and `caseSensitive` to `false` (Excel defaults) engine-side when
 * omitted.
 */
export interface SortKeyWire {
  col: number
  direction?: 'asc' | 'desc'
  caseSensitive?: boolean
}

/** Zero-based bounds; the object alternative to an A1 range string. */
export interface SortRangeBoundsWire {
  startRow: number
  startCol: number
  endRow: number
  endCol: number
}

/**
 * `sortRange` request payload (forwarded verbatim to the engine binding).
 * `range` is an A1 string (`"A1:B9"` or `"A1"`) or a zero-based bounds
 * object; `excludedRows` are 0-based SOURCE rows the host holds in place
 * (hidden ∪ filtered-out ∪ summary), assembled by the caller.
 */
export interface SortRangePayloadWire {
  range: string | SortRangeBoundsWire
  keys: SortKeyWire[]
  excludedRows?: number[]
}

/**
 * Success witness. `rowPermutation` is `[[slotRow, sourceRow], …]` over
 * the CHANGED slots only — reserved for overlay remap / parity; v1
 * consumers may ignore it.
 */
export interface SortRangeReportWire {
  movedRows: number
  movedCells: number
  rowPermutation: Array<[number, number]>
}

/**
 * Structured reject reasons the engine returns. They ride on the
 * `SORT_REJECTED` RPC error's `detail` (see `RpcErrorWire.detail`) rather
 * than the flat `code`/`message` pair, so `anchor` survives.
 */
export type SortRangeRejectCode =
  | 'invalid-range'
  | 'empty-keys'
  | 'key-out-of-range'
  | 'spill-in-range'
  | 'invalid-payload'

export interface SortRangeRejectWire {
  code: SortRangeRejectCode
  /** Present only for `spill-in-range` — the intersecting anchor (A1). */
  anchor?: string
  message?: string
}

// === Excel Table registry wire (#32) — CRUD DTO ===

/**
 * Serialized `TableEntry` as emitted by the WASM `listTables` / `getTable`
 * bindings (`excel/rust/wasm/src/lib.rs` `TableJSON`). `range` is an A1 string
 * (`"A1:C10"`) spanning header + data (+ totals when present); `sheetIndex`
 * is the resolved 0-based engine sheet index and `sheet` its display name.
 */
export interface TableJSONWire {
  name: string
  sheet: string
  sheetIndex: number
  range: string
  hasHeaders: boolean
  hasTotals: boolean
  columns: string[]
}

/**
 * Structured reject reasons the engine returns for a table mutation. They
 * ride on the `TABLE_REJECTED` RPC error's `detail` (see
 * `RpcErrorWire.detail`) — `detail.code` is the raw engine `TableError`
 * string, mirroring the `SORT_REJECTED` convention so the host adapter can
 * map it to a structured not-applied result instead of a bare throw.
 */
export type TableRejectCode =
  | 'too-many-tables'
  | 'invalid-name'
  | 'reserved-name'
  | 'name-like-cell-ref'
  | 'name-conflict'
  | 'range-overlap'
  | 'sheet-not-found'
  | 'not-found'
  | 'column-not-found'
  | 'duplicate-column'
  | 'invalid-column-name'
  | 'mutation-during-custom-call'
  // Totals-row gates (parity #32 T6). `invalid-totals-function` is thrown by
  // the WASM binding (not a `TableError`) but rides the same bare-string
  // path, so it recognizes here alongside the engine reasons.
  | 'totals-row-blocked'
  | 'no-totals-row'
  | 'invalid-totals-function'
  // Registry snapshot/restore gates (#25 undo). `restoreTables` validates the
  // WHOLE payload before it swaps anything, so these two never leave the
  // registry half-applied. They are not `TableError` variants — the WASM
  // binding raises them for a bad envelope — but they ride the same
  // bare-string path, so they recognize here alongside the engine reasons.
  | 'unsupported-snapshot-version'
  | 'malformed-snapshot'

export interface TableRejectWire {
  code: TableRejectCode
  message?: string
}

/**
 * Versioned envelope produced by `snapshotTables` and consumed by
 * `restoreTables` (excel/rust/wasm `TableRegistrySnapshotJSON`). `tables` carries
 * the same per-Table shape `listTables` emits; `sheetIndex` is IGNORED on the
 * way back in (the engine anchors Tables by sheet NAME, so a snapshot
 * survives `moveSheet` between capture and restore).
 *
 * This is the before-image for Table DEFINITION changes — the registry
 * itself (name, sheet anchor, range, header/totals flags, column names),
 * which no sparse-cell or format snapshot carries.
 */
export interface TableRegistrySnapshotWire {
  version: number
  tables: TableJSONWire[]
}

// === Engine-owned hidden rows + filter wire (E5, design-engine-hidden-rows) ===
//
// The engine now OWNS the manually-hidden row set (E2) and the filter rules +
// derived hidden set (E3). These wire shapes forward the E2/E3 wasm exports
// (`hideRows` / `unhideRows` / `listHiddenRows` / `snapshotHidden` /
// `restoreHidden` / `applyFilter` / `reapplyFilter` / `clearFilter` /
// `getFilter` / `snapshotFilters` / `restoreFilters`) so the host adapter can
// CALL the engine instead of pushing a set it computed itself.

/**
 * One column filter rule — the cross-language wire shape. Byte-for-byte the
 * `ColumnFilterRule` union in `@einfach/spreadsheet-ui-core` and the
 * `ColumnFilterRuleJSON` serde mirror in `excel/rust/wasm`, so a host forwards its
 * existing rule objects with no mapping layer. `list` compares RAW strings
 * while `equals`/`contains` case-fold by default — a deliberate existing
 * inconsistency the engine reproduces (design §5.2), not a wire bug.
 */
export type ColumnFilterRuleWire =
  | { kind: 'equals'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'contains'; colIndex: number; value: string; caseSensitive?: boolean }
  | { kind: 'range'; colIndex: number; min?: number; max?: number }
  | { kind: 'list'; colIndex: number; values: readonly string[] }

/**
 * Success shape of `applyFilter` / `reapplyFilter` / `clearFilter`, mirroring
 * the `sortRange` `{ ok: true, … }` convention so a caller discriminates on
 * `ok` alone. `hiddenRows` is the 0-based SOURCE rows the rules hid for the
 * WHOLE scanned extent — the answer the host returns verbatim on the
 * `setFilterSort` ACK.
 */
export interface FilterApplyReportWire {
  ok: true
  hiddenRows: number[]
  scannedRows: number
  predicateCells: number
}

/**
 * Structured refusal of a filter command — arrives INSIDE the resolved value
 * (never a thrown exception), exactly like the wasm binding returns it.
 * `source-too-large` is the engine-side twin of the adapter's legacy
 * `FILTER_SORT_SOURCE_TOO_LARGE`; the filter does NOT activate and nothing is
 * truncated.
 */
export type FilterApplyRejectCode =
  | 'invalid-sheet'
  | 'mutation-during-custom-call'
  | 'source-too-large'
  | 'invalid-payload'

export interface FilterApplyRejectWire {
  ok: false
  code: FilterApplyRejectCode
  message?: string
}

export type FilterApplyResultWire = FilterApplyReportWire | FilterApplyRejectWire

/**
 * One sheet's committed filter as `getFilter` returns it and as the
 * `snapshotFilters` / `restoreFilters` envelope carries it. Sheet-INDEX keyed.
 * A WHOLE-SHEET read on purpose: a host must know about hidden rows OUTSIDE the
 * visible window to expand that window correctly.
 */
export interface SheetFilterStateWire {
  sheet: number
  rules: ColumnFilterRuleWire[]
  hiddenRows: number[]
}

/** One sheet's manually-hidden rows — element of the `snapshotHidden` envelope. */
export interface SheetHiddenRowsWire {
  sheet: number
  rows: number[]
}

/**
 * `snapshotHidden` / `restoreHidden` envelope (whole-workbook undo
 * before-image). Restoring an empty `hidden` array CLEARS every sheet's manual
 * set — that is the point of REPLACE, not a no-op.
 */
export interface HiddenRowsSnapshotWire {
  version: number
  hidden: SheetHiddenRowsWire[]
}

/** `snapshotFilters` / `restoreFilters` envelope, versioned like its hidden twin. */
export interface FilterSnapshotWire {
  version: number
  filters: SheetFilterStateWire[]
}
