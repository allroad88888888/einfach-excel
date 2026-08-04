// 一句话：把「变更前的值」记进当前在途增量的记录器族。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import {
  cloneCell,
  cloneConditionalFormatRuleEntry,
  cloneFormat,
  cloneNamedRange,
  isCoordInsideRange,
} from '@einfach/spreadsheet-ui-core'
import { isCellInsideRange, parseKey } from './cell-map'
import type { SheetDelta, StateDelta } from './history-delta'
import { STATIC_BACKEND_UNDO_CAP } from './history-delta'
import { nextRevisionOrThrow } from './revision'
import { captureFullSheet, cloneRangeFormatLayers } from './sheet-snapshot'
import type { StaticBackendState } from './state'

export function beginUndoableMutation(state: StaticBackendState): void {
  // Every history-producing mutation must be able to publish a distinct
  // projection witness before it records history or changes workbook facts.
  // The mutation itself remains responsible for assigning the next revision
  // after its facts have been applied.
  nextRevisionOrThrow(state.revision)
  const delta: StateDelta = { sheetDeltas: new Map() }
  state.pendingDelta = delta
  state.undoStack.push(delta)
  if (state.undoStack.length > STATIC_BACKEND_UNDO_CAP) {
    state.undoStack.shift()
  }
  // Any forward-history is invalidated by a new mutation.
  state.redoStack = []
}

function pendingSheetDelta(state: StaticBackendState, sheetId: string): SheetDelta | null {
  const delta = state.pendingDelta
  if (!delta) return null
  let sheet = delta.sheetDeltas.get(sheetId)
  if (!sheet) {
    sheet = {}
    delta.sheetDeltas.set(sheetId, sheet)
  }
  // A full-sheet capture already covers every granular field.
  return sheet.fullSheet ? null : sheet
}

export function recordCellBefore(state: StaticBackendState, sheetId: string, key: string): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const cells = sheet.cells ?? (sheet.cells = new Map())
  if (cells.has(key)) return // first touch wins
  const cell = state.cellsBySheet.get(sheetId)?.get(key)
  cells.set(key, cell ? cloneCell(cell) : null)
}

export function recordCellsBeforeInRange(
  state: StaticBackendState,
  sheetId: string,
  range: CellRange,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const live = state.cellsBySheet.get(sheetId)
  if (!live) return
  const cells = sheet.cells ?? (sheet.cells = new Map())
  for (const [key, cell] of live) {
    if (!isCellInsideRange(cell, range)) continue
    if (!cells.has(key)) cells.set(key, cloneCell(cell))
  }
}

export function recordCellFormatBefore(
  state: StaticBackendState,
  sheetId: string,
  key: string,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const formats = sheet.cellFormats ?? (sheet.cellFormats = new Map())
  if (formats.has(key)) return
  const format = state.cellFormatsBySheetId.get(sheetId)?.get(key)
  formats.set(key, format ? cloneFormat(format) : null)
}

export function recordCellFormatsBeforeInRange(
  state: StaticBackendState,
  sheetId: string,
  range: CellRange,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const live = state.cellFormatsBySheetId.get(sheetId)
  if (!live) return
  const formats = sheet.cellFormats ?? (sheet.cellFormats = new Map())
  for (const [key, format] of live) {
    const coord = parseKey(key)
    if (!coord || !isCoordInsideRange(coord.row, coord.col, range)) continue
    if (!formats.has(key)) formats.set(key, cloneFormat(format))
  }
}

export function recordRangeFormatsBefore(state: StaticBackendState, sheetId: string): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet || sheet.rangeFormats) return
  sheet.rangeFormats = cloneRangeFormatLayers(state.rangeFormatsBySheetId.get(sheetId) ?? [])
}

export function recordConditionalRulesBefore(state: StaticBackendState, sheetId: string): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet || sheet.conditionalFormatRules) return
  sheet.conditionalFormatRules = (state.conditionalFormatRulesBySheetId.get(sheetId) ?? []).map(
    cloneConditionalFormatRuleEntry,
  )
}

export function recordMergeRangesBefore(state: StaticBackendState, sheetId: string): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet || sheet.mergeRanges) return
  sheet.mergeRanges = (state.mergeRangesBySheetId.get(sheetId) ?? []).map((r) => ({ ...r }))
}

export function recordRowHeightBefore(
  state: StaticBackendState,
  sheetId: string,
  rowIndex: number,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const heights = sheet.rowHeights ?? (sheet.rowHeights = new Map())
  if (heights.has(rowIndex)) return
  heights.set(rowIndex, state.rowHeightsBySheetId.get(sheetId)?.get(rowIndex) ?? null)
}

export function recordColWidthBefore(
  state: StaticBackendState,
  sheetId: string,
  colIndex: number,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const widths = sheet.colWidths ?? (sheet.colWidths = new Map())
  if (widths.has(colIndex)) return
  widths.set(colIndex, state.colWidthsBySheetId.get(sheetId)?.get(colIndex) ?? null)
}

export function recordHiddenIndexBefore(
  state: StaticBackendState,
  sheetId: string,
  axis: 'row' | 'column',
  index: number,
): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet) return
  const recorded =
    axis === 'row'
      ? (sheet.hiddenRows ?? (sheet.hiddenRows = new Map()))
      : (sheet.hiddenCols ?? (sheet.hiddenCols = new Map()))
  if (recorded.has(index)) return
  const live =
    axis === 'row' ? state.hiddenRowsBySheetId.get(sheetId) : state.hiddenColsBySheetId.get(sheetId)
  recorded.set(index, live?.has(index) ?? false)
}

export function recordFreezeBefore(state: StaticBackendState, sheetId: string): void {
  const sheet = pendingSheetDelta(state, sheetId)
  if (!sheet || sheet.freeze !== undefined) return
  const freeze = state.freezeBySheetId.get(sheetId)
  sheet.freeze = freeze ? { ...freeze } : null
}

export function recordNamedRangesBefore(state: StaticBackendState): void {
  const delta = state.pendingDelta
  if (!delta || delta.namedRanges) return
  delta.namedRanges = state.namedRanges.map(cloneNamedRange)
}

export function recordSheetsMetaBefore(state: StaticBackendState): void {
  const delta = state.pendingDelta
  if (!delta || delta.sheetsMeta) return
  delta.sheetsMeta = state.sheets.map((s) => ({ ...s }))
}

export function recordFullSheetBefore(state: StaticBackendState, sheetId: string): void {
  const delta = state.pendingDelta
  if (!delta) return
  let sheet = delta.sheetDeltas.get(sheetId)
  if (!sheet) {
    sheet = {}
    delta.sheetDeltas.set(sheetId, sheet)
  }
  if (sheet.fullSheet) return
  sheet.fullSheet = captureFullSheet(state, sheetId)
  // Full capture supersedes any granular records taken earlier.
  delete sheet.cells
  delete sheet.cellFormats
  delete sheet.rangeFormats
  delete sheet.conditionalFormatRules
  delete sheet.mergeRanges
  delete sheet.rowHeights
  delete sheet.colWidths
  delete sheet.hiddenRows
  delete sheet.hiddenCols
  delete sheet.freeze
}
