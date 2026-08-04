// 一句话：后端侧撤销/重做所用的反向增量结构。

import type {
  CellRange,
  ConditionalFormatRuleEntry,
  DisplayCell,
  FilterSortState,
  NamedRange,
  RangeFormatLayer,
  SpreadsheetCellFormat,
  SpreadsheetSheetMetadata,
  ViewportFreezeConfig,
} from '@einfach/spreadsheet-ui-core'

/**
 * Reverse-delta history (audit D-2).
 *
 * `beginUndoableMutation` used to deep-clone EVERY cell of EVERY sheet
 * (plus all format/merge/dimension tables) per undoable mutation —
 * measured 108× slowdown per keystroke at 20k cells vs 50, and a
 * steady-state memory of 200 × workbook. History entries are now
 * before-value deltas scoped to exactly what the mutation touches
 * (mirroring ui-core history's small-descriptor contract): undo applies
 * the reverse delta and symmetrically captures a forward delta for redo.
 *
 * Cost is O(change) per mutation. Structural ops that genuinely rewrite
 * a whole sheet (row/column shifts, removeRows, deleteSheet) use the
 * labeled `fullSheet` fallback — O(one sheet), never O(workbook).
 *
 * All captured values are CLONES: some mutations (validation rules)
 * mutate live cell objects in place, so a recorded before-value must
 * not alias live state.
 */
export interface FullSheetCapture {
  cells: Map<string, DisplayCell>
  cellFormats: Map<string, SpreadsheetCellFormat>
  rangeFormats: RangeFormatLayer[]
  conditionalFormatRules: ConditionalFormatRuleEntry[]
  mergeRanges: CellRange[]
  rowHeights: Map<number, number>
  colWidths: Map<number, number>
  hiddenRows: Set<number>
  hiddenCols: Set<number>
  /**
   * FILTER-hidden rows (S5a). Captured alongside the manual set because a
   * structural mutation now REMAPS it: undoing an insert/delete has to put
   * the pre-shift snapshot back, exactly as it does for `hiddenRows`. The
   * filter RULES are not part of the capture — they are not displaced.
   */
  filterHiddenRows: Set<number>
  /** null preserves an absent map entry; `{ rows: 0, cols: 0 }` is canonical data. */
  freeze: ViewportFreezeConfig | null
}

export interface SheetDelta {
  /** Before-values per touched cell key; null = key was absent. */
  cells?: Map<string, DisplayCell | null>
  cellFormats?: Map<string, SpreadsheetCellFormat | null>
  /** Whole-table before-clones for small per-sheet tables (bounded by op count, not cell count). */
  rangeFormats?: RangeFormatLayer[]
  conditionalFormatRules?: ConditionalFormatRuleEntry[]
  mergeRanges?: CellRange[]
  rowHeights?: Map<number, number | null>
  colWidths?: Map<number, number | null>
  /** Before-membership per touched index; false means the index was visible. */
  hiddenRows?: Map<number, boolean>
  hiddenCols?: Map<number, boolean>
  /** null means the canonical entry was absent; undefined means this delta did not touch freeze. */
  freeze?: ViewportFreezeConfig | null
  /**
   * Before-image of the sheet's FILTER (rules + derived hidden rows) for a
   * filter apply/clear undo (2026-07-22 Excel-parity flip). `rules === null` /
   * `hiddenRows === null` mean the sheet had no filter entry; `undefined`
   * (the whole field) means this delta did not touch the filter. Both halves
   * ride together because they are one committed fact — a rename-free apply
   * changes rules and the derived set in the same step, and undoing a delete-
   * band case (no inverse) needs the exact recorded rows, not a remap.
   */
  filter?: { rules: FilterSortState | null; hiddenRows: Set<number> | null }
  /** Labeled O(one-sheet) fallback for structural ops. Supersedes the granular fields. */
  fullSheet?: FullSheetCapture
}

export interface StateDelta {
  // Revisions are monotonic projection witnesses, not historical workbook
  // facts. Undo/redo swaps only captured state and advances the live witness.
  sheetDeltas: Map<string, SheetDelta>
  namedRanges?: NamedRange[]
  sheetsMeta?: SpreadsheetSheetMetadata[]
}

export const STATIC_BACKEND_UNDO_CAP = 200
