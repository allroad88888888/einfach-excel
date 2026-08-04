// 一句话：静态后端持有的整份可变工作簿状态。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  DisplayCell,
  FilterSortState,
  NamedRange,
  ProjectionRevision,
  RangeFormatLayer,
  SpreadsheetCellFormat,
  SpreadsheetSheetMetadata,
  ViewportFreezeConfig,
} from '@einfach/spreadsheet-ui-core'
import type { StateDelta } from './history-delta'

/**
 * Bounded per-workbook Table cap (#32). Mirrors the engine `MAX_TABLES`
 * and the UI-core `MAX_TABLE_CATALOG_ENTRIES` so all three layers agree on
 * the ceiling.
 */
export const MAX_STATIC_TABLES = 256

/** One registered Excel Table in the static backend (mirror of the engine `TableEntry`). */
export interface StaticTableEntry {
  /** Display-cased name the user supplied / the engine auto-generated. */
  canonicalName: string
  /** UI-core stable sheet id the Table is anchored to. */
  sheetId: string
  /** Normalized rectangle: header row + data rows (+ totals row when shown). */
  range: CellRange
  /** MVP invariant: always `true` (row 0 of the range is the header). */
  hasHeaders: boolean
  /** Whether a totals row is currently shown (MVP: always `false`). */
  hasTotals: boolean
  /** Column display names, left→right (index 0 == `range.colStart`). */
  columns: string[]
}

export interface StaticBackendState {
  cellsBySheet: Map<string, Map<string, DisplayCell>>
  cellFormatsBySheetId: Map<string, Map<string, SpreadsheetCellFormat>>
  rangeFormatsBySheetId: Map<string, RangeFormatLayer[]>
  conditionalFormatRulesBySheetId: Map<string, ConditionalFormatRuleEntry[]>
  filterSortBySheetId: Map<string, FilterSortState>
  namedRanges: NamedRange[]
  /**
   * Excel Table registry (#32, design-excel-table §4). Workbook-level,
   * keyed by the uppercased Table name (case-insensitive lookup;
   * `canonicalName` keeps the display casing). The registry is the single
   * source of truth for a Table's geometry — structured references resolve
   * against it at eval time and `listTables` / `getTable` project it. Bounded
   * to {@link MAX_STATIC_TABLES}. NOT captured by the undo delta (parity with
   * the worker/engine: table-definition mutations are out of the undo
   * timeline — design §11/§12).
   */
  tablesByKey: Map<string, StaticTableEntry>
  mergeRangesBySheetId: Map<string, CellRange[]>
  rowHeightsBySheetId: Map<string, Map<number, number>>
  colWidthsBySheetId: Map<string, Map<number, number>>
  hiddenRowsBySheetId: Map<string, Set<number>>
  hiddenColsBySheetId: Map<string, Set<number>>
  /**
   * FILTER-hidden rows derived by THIS backend when `setFilterSort` applied
   * the rules (`design-filter-hidden-rows` §4.2, slice S4) — the static
   * counterpart of what the worker adapter pushes into the engine through
   * `setEvalFilterHiddenRows`.
   *
   * Independent of `hiddenRowsBySheetId` on purpose, and NEVER merged with
   * it: Excel's `SUBTOTAL(1-11)` excludes filter-hidden rows while INCLUDING
   * manually hidden ones, a rule one merged set cannot express (design §3
   * constraint 1). Snapshot semantics — computed when the rules are applied,
   * not re-derived on every read, matching Excel's `Data → Reapply` model and
   * the worker's push point exactly.
   */
  filterHiddenRowsBySheetId: Map<string, Set<number>>
  freezeBySheetId: Map<string, ViewportFreezeConfig>
  sheets: SpreadsheetSheetMetadata[]
  revision: ProjectionRevision
  /** BCP-47 workbook locale used by the projection-layer number-format pipeline. */
  workbookLocale?: string
  /** LIFO reverse deltas (state-before-mutation) for backend-side undo. */
  undoStack: StateDelta[]
  /** LIFO forward deltas populated when undoing so redo can roll forward. */
  redoStack: StateDelta[]
  /**
   * The delta the in-flight mutation records into. Set by
   * `beginUndoableMutation`; every record* helper writes here. Null
   * outside mutations (recorders then no-op).
   */
  pendingDelta: StateDelta | null
}

export function getOrCreateSheetCells(
  state: StaticBackendState,
  sheetId: string,
): Map<string, DisplayCell> {
  let cells = state.cellsBySheet.get(sheetId)
  if (!cells) {
    cells = new Map()
    state.cellsBySheet.set(sheetId, cells)
  }
  return cells
}

export function getOrCreateCellFormats(
  state: StaticBackendState,
  sheetId: string,
): Map<string, SpreadsheetCellFormat> {
  let formats = state.cellFormatsBySheetId.get(sheetId)
  if (!formats) {
    formats = new Map()
    state.cellFormatsBySheetId.set(sheetId, formats)
  }
  return formats
}

export function getOrCreateRangeFormats(
  state: StaticBackendState,
  sheetId: string,
): RangeFormatLayer[] {
  let layers = state.rangeFormatsBySheetId.get(sheetId)
  if (!layers) {
    layers = []
    state.rangeFormatsBySheetId.set(sheetId, layers)
  }
  return layers
}

export function getDimensionMap(
  sizesBySheetId: Map<string, Map<number, number>>,
  sheetId: string,
): Map<number, number> {
  let sizes = sizesBySheetId.get(sheetId)
  if (!sizes) {
    sizes = new Map()
    sizesBySheetId.set(sheetId, sizes)
  }
  return sizes
}
