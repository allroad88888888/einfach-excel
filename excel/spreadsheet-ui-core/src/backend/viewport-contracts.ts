import type { ColumnFilterRule } from '../filter-sort/types'
import type { CellRange, SheetRef } from '../shared'
import type { ProjectionRequestId, ProjectionRevision } from './projection-primitives'

/** 视口尺寸和隐藏行列的读写数据契约。 */
export interface ViewportSizeProjectionRequest extends SheetRef {
  kind: 'viewport-size'
  window: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface ViewportRowHeight {
  rowIndex: number
  heightPx: number
}

export interface ViewportColumnWidth {
  colIndex: number
  widthPx: number
}

export interface ViewportSizeProjectionResult extends SheetRef {
  kind: 'viewport-size'
  window: CellRange
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  rowHeights: ViewportRowHeight[]
  colWidths: ViewportColumnWidth[]
  hiddenRowIndices?: number[]
  hiddenColIndices?: number[]
}

/**
 * Read-back of a sheet's ENGINE-OWNED hidden state
 * (`design-engine-hidden-rows` §4.2). Since the sink-down the engine — not the
 * host — is the authoritative STORE of manually hidden rows and the filter
 * (rules + derived hidden set), so the host needs a way to hydrate its render
 * caches from it: on sheet activation, on an ACK-less fallback, and after a
 * workbook restore. Deliberately NOT the window-bounded
 * `readViewportSizeProjection` — a host must know about hidden rows OUTSIDE the
 * visible window to expand that window correctly.
 */
export interface SheetHiddenStateRequest extends SheetRef {
  kind: 'sheet-hidden-state'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SheetHiddenStateResult extends SheetRef {
  kind: 'sheet-hidden-state'
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
  /** 0-based manually hidden rows (engine `listHiddenRows`). */
  manualRows: readonly number[]
  /** 0-based rows the active filter hid (engine `getFilter().hiddenRows`). */
  filterRows: readonly number[]
  /** The committed filter rules (engine `getFilter().rules`); `[]` when no filter. */
  filterRules: readonly ColumnFilterRule[]
  // NOTE: no `manualCols`. The engine models NO hidden columns (§8 — SUBTOTAL
  // filters on `addr.row` only), so it has nothing authoritative to report;
  // hidden columns stay UI-core canonical and hydrate from UI-core's own
  // persistence. An always-empty field here would let a hydration consumer
  // wrongly CLEAR real hidden columns.
}

export interface HideRowsRequest extends SheetRef {
  kind: 'hide-rows'
  rowIndices: number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface UnhideRowsRequest extends SheetRef {
  kind: 'unhide-rows'
  rowIndices: number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface HideColumnsRequest extends SheetRef {
  kind: 'hide-columns'
  colIndices: number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface UnhideColumnsRequest extends SheetRef {
  kind: 'unhide-columns'
  colIndices: number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

/**
 * Engine evaluation-input push for the hidden-row set (parity #23 —
 * SUBTOTAL 101-111 exclude manually hidden rows). Hidden rows are a
 * UI-core canonical VIEW fact (`viewportHiddenAtom`); this port mirrors
 * the per-sheet set into the formula engine so the 101-111 SUBTOTAL
 * variants can drop hidden data rows at eval time. Unlike a mutation it
 * carries NO exact ACK / undo — it is a whole-set REPLACE (idempotent;
 * repeated identical pushes are safe, an empty `rows` clears the set) and
 * fire-and-forget. Optional capability: a backend whose engine models no
 * hidden-row eval input omits the port and UI core silently skips the
 * push — SUBTOTAL 101-111 then degrades to "does not exclude" (the same
 * result as SUBTOTAL 1-11), never breaking any other feature.
 */
export interface SetEvalHiddenRowsRequest extends SheetRef {
  kind: 'set-eval-hidden-rows'
  /** 0-based hidden row indices; whole-set replace. Empty clears the sheet's set. */
  rows: readonly number[]
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SetRowHeightRequest extends SheetRef {
  kind: 'set-row-height'
  rowIndex: number
  heightPx: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}

export interface SetColumnWidthRequest extends SheetRef {
  kind: 'set-column-width'
  colIndex: number
  widthPx: number
  requestId?: ProjectionRequestId
  revision?: ProjectionRevision
}
