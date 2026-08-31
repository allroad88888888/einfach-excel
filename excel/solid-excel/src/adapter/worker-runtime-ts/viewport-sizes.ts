import type {
  SparseRangeWire,
  ViewportColumnWidthWire,
  ViewportRowHeightWire,
  ViewportSizeSnapshotWire,
  WorkbookPersistenceSnapshotWire,
} from '../worker-protocol'
import { normalizeSparseRange } from '../worker-wire-guards'
import { rpcError } from './runtime-errors'
import { assertSheetIdx, type RuntimeState, type SheetEntry } from './runtime-state'

const FULL_SHEET_SIZE_BOUND = 0xffffffff

function normalizeDimensionRange(range: SparseRangeWire): SparseRangeWire {
  return {
    sheet: range.sheet,
    startRow: Math.min(range.startRow, range.endRow),
    startCol: Math.min(range.startCol, range.endCol),
    endRow: Math.max(range.startRow, range.endRow),
    endCol: Math.max(range.startCol, range.endCol),
  }
}

function normalizeStructuralIndex(value: unknown, name: string): number {
  const index = Number(value)
  if (!Number.isInteger(index) || index < 0) {
    throw rpcError('INVALID_STRUCTURAL_EDIT', `invalid ${name}`)
  }
  return index
}

function normalizeDimensionPx(value: unknown, name: string): number {
  const size = Number(value)
  if (!Number.isFinite(size) || size <= 0) {
    throw rpcError('INVALID_DIMENSION_SIZE', `invalid ${name}`)
  }
  return Math.max(1, Math.round(size))
}

function getDimensionMap(
  maps: Map<string, Map<number, number>>,
  sheetName: string,
): Map<number, number> {
  let sizes = maps.get(sheetName)
  if (!sizes) {
    sizes = new Map()
    maps.set(sheetName, sizes)
  }
  return sizes
}

function sortedDimensionEntries(
  sizes: ReadonlyMap<number, number> | undefined,
  start: number,
  end: number,
): Array<[number, number]> {
  if (!sizes) return []
  const lo = Math.min(start, end)
  const hi = Math.max(start, end)
  return [...sizes.entries()]
    .filter(([index]) => index >= lo && index <= hi)
    .sort(([a], [b]) => a - b)
}

function rowHeightsFor(
  state: RuntimeState,
  sheet: SheetEntry,
  startRow: number,
  endRow: number,
): ViewportRowHeightWire[] {
  return sortedDimensionEntries(state.rowHeightsBySheetName.get(sheet.name), startRow, endRow).map(
    ([rowIndex, heightPx]) => ({ rowIndex, heightPx }),
  )
}

function colWidthsFor(
  state: RuntimeState,
  sheet: SheetEntry,
  startCol: number,
  endCol: number,
): ViewportColumnWidthWire[] {
  return sortedDimensionEntries(state.colWidthsBySheetName.get(sheet.name), startCol, endCol).map(
    ([colIndex, widthPx]) => ({ colIndex, widthPx }),
  )
}

export function snapshotViewportSizes(
  state: RuntimeState,
  range: SparseRangeWire,
): ViewportSizeSnapshotWire {
  const sheet = assertSheetIdx(state, range.sheet)
  const normalized = normalizeDimensionRange(range)
  return {
    ...normalized,
    rowHeights: rowHeightsFor(state, sheet, normalized.startRow, normalized.endRow),
    colWidths: colWidthsFor(state, sheet, normalized.startCol, normalized.endCol),
  }
}

export function setRowHeight(
  state: RuntimeState,
  sheetValue: unknown,
  rowIndexValue: unknown,
  heightPxValue: unknown,
): boolean {
  const sheet = assertSheetIdx(state, normalizeStructuralIndex(sheetValue, 'sheet index'))
  const rowIndex = normalizeStructuralIndex(rowIndexValue, 'row index')
  const heightPx = normalizeDimensionPx(heightPxValue, 'row height')
  getDimensionMap(state.rowHeightsBySheetName, sheet.name).set(rowIndex, heightPx)
  return true
}

export function setColumnWidth(
  state: RuntimeState,
  sheetValue: unknown,
  colIndexValue: unknown,
  widthPxValue: unknown,
): boolean {
  const sheet = assertSheetIdx(state, normalizeStructuralIndex(sheetValue, 'sheet index'))
  const colIndex = normalizeStructuralIndex(colIndexValue, 'column index')
  const widthPx = normalizeDimensionPx(widthPxValue, 'column width')
  getDimensionMap(state.colWidthsBySheetName, sheet.name).set(colIndex, widthPx)
  return true
}

export function snapshotPersistenceSizes(state: RuntimeState): ViewportSizeSnapshotWire[] {
  const out: ViewportSizeSnapshotWire[] = []
  for (const sheet of state.sheets) {
    const rowHeights = rowHeightsFor(state, sheet, 0, FULL_SHEET_SIZE_BOUND)
    const colWidths = colWidthsFor(state, sheet, 0, FULL_SHEET_SIZE_BOUND)
    if (rowHeights.length === 0 && colWidths.length === 0) continue
    out.push({
      sheet: sheet.idx,
      startRow: 0,
      startCol: 0,
      endRow: FULL_SHEET_SIZE_BOUND,
      endCol: FULL_SHEET_SIZE_BOUND,
      rowHeights,
      colWidths,
    })
  }
  return out
}

export function restorePersistenceSizes(
  state: RuntimeState,
  snapshot: Pick<WorkbookPersistenceSnapshotWire, 'sizes'> | undefined,
) {
  resetViewportSizes(state)
  for (const sizeSnapshot of snapshot?.sizes ?? []) {
    const sheet = assertSheetIdx(state, Number(sizeSnapshot.sheet))
    const range = normalizeDimensionRange(normalizeSparseRange(sizeSnapshot))
    for (const row of sizeSnapshot.rowHeights ?? []) {
      const rowIndex = normalizeStructuralIndex(row.rowIndex, 'row index')
      if (rowIndex < range.startRow || rowIndex > range.endRow) {
        throw rpcError('INVALID_DIMENSION_SIZE', `row height outside snapshot range: ${rowIndex}`)
      }
      getDimensionMap(state.rowHeightsBySheetName, sheet.name).set(
        rowIndex,
        normalizeDimensionPx(row.heightPx, 'row height'),
      )
    }
    for (const col of sizeSnapshot.colWidths ?? []) {
      const colIndex = normalizeStructuralIndex(col.colIndex, 'column index')
      if (colIndex < range.startCol || colIndex > range.endCol) {
        throw rpcError('INVALID_DIMENSION_SIZE', `column width outside snapshot range: ${colIndex}`)
      }
      getDimensionMap(state.colWidthsBySheetName, sheet.name).set(
        colIndex,
        normalizeDimensionPx(col.widthPx, 'column width'),
      )
    }
  }
}

export function resetViewportSizes(state: RuntimeState) {
  state.rowHeightsBySheetName = new Map()
  state.colWidthsBySheetName = new Map()
}

export function renameViewportSizesSheet(state: RuntimeState, oldName: string, newName: string) {
  if (oldName === newName) return
  renameDimensionMap(state.rowHeightsBySheetName, oldName, newName)
  renameDimensionMap(state.colWidthsBySheetName, oldName, newName)
}

export function removeViewportSizesSheet(state: RuntimeState, sheetName: string) {
  state.rowHeightsBySheetName.delete(sheetName)
  state.colWidthsBySheetName.delete(sheetName)
}

function renameDimensionMap(
  maps: Map<string, Map<number, number>>,
  oldName: string,
  newName: string,
) {
  const sizes = maps.get(oldName)
  if (!sizes) return
  maps.delete(oldName)
  maps.set(newName, sizes)
}
