import {
  parseA1,
  SPILL_PROJECTION_LOOKBACK,
  type Cell,
  type CellRange,
} from '@einfach/excel-core-ts'

import type { CellSnapshotWire, SparseCellWire, SparseRangeWire } from '../worker-protocol'
import { readCellSnapshot, readCellValue, readSparseCell } from './cell-values'
import { assertSheetIdx, type RuntimeState, type SheetEntry } from './runtime-state'

function clampRangeToSheet(range: SparseRangeWire): CellRange {
  return {
    rowStart: Math.max(0, range.startRow),
    rowEnd: Math.max(0, range.endRow),
    colStart: Math.max(0, range.startCol),
    colEnd: Math.max(0, range.endCol),
  }
}

function collectCellsInBounds(
  cells: ReadonlyMap<string, Cell>,
  bounds: CellRange,
): Array<{ key: string; row: number; col: number; cell: Cell }> {
  const out: Array<{ key: string; row: number; col: number; cell: Cell }> = []
  const rowCount = bounds.rowEnd - bounds.rowStart + 1
  const colCount = bounds.colEnd - bounds.colStart + 1
  if (rowCount <= 0 || colCount <= 0) return out
  if (rowCount * colCount <= cells.size) {
    for (let row = bounds.rowStart; row <= bounds.rowEnd; row += 1) {
      for (let col = bounds.colStart; col <= bounds.colEnd; col += 1) {
        const key = `${row}:${col}`
        const cell = cells.get(key)
        if (cell) out.push({ key, row, col, cell })
      }
    }
    return out
  }
  for (const [key, cell] of cells) {
    const separator = key.indexOf(':')
    const row = Number(key.slice(0, separator))
    const col = Number(key.slice(separator + 1))
    if (
      row >= bounds.rowStart &&
      row <= bounds.rowEnd &&
      col >= bounds.colStart &&
      col <= bounds.colEnd
    ) {
      out.push({ key, row, col, cell })
    }
  }
  return out
}

function collectSpillTargets(
  state: RuntimeState,
  sheet: SheetEntry,
  bounds: CellRange,
): Array<{ row: number; col: number }> {
  const target = state.workbook.sheet(sheet.id)
  if (!target) return []
  const cells = state.workbook.store.getter(target.sheetAtom)
  const out: Array<{ row: number; col: number }> = []
  const anchorBounds: CellRange = {
    rowStart: Math.max(0, bounds.rowStart - SPILL_PROJECTION_LOOKBACK),
    rowEnd: bounds.rowEnd,
    colStart: Math.max(0, bounds.colStart - SPILL_PROJECTION_LOOKBACK),
    colEnd: bounds.colEnd,
  }
  for (const { key, row: anchorRow, col: anchorCol, cell } of collectCellsInBounds(
    cells,
    anchorBounds,
  )) {
    if (!cell.input.startsWith('=') || target._debug.cellState(key) !== 'clean') continue
    const value = state.workbook.store.getter(target.formulaCellAtom(key))
    if (value.kind !== 'array') continue
    const rows = value.value.length
    const cols = value.value[0]?.length ?? 0
    for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
      for (let colOffset = 0; colOffset < cols; colOffset += 1) {
        if (rowOffset === 0 && colOffset === 0) continue
        const row = anchorRow + rowOffset
        const col = anchorCol + colOffset
        if (row < bounds.rowStart || row > bounds.rowEnd) continue
        if (col < bounds.colStart || col > bounds.colEnd) continue
        if (!cells.has(`${row}:${col}`)) out.push({ row, col })
      }
    }
  }
  return out
}

export function snapshotRangeSparse(state: RuntimeState, range: SparseRangeWire): SparseCellWire[] {
  const sheet = assertSheetIdx(state, range.sheet)
  const bounds = clampRangeToSheet(range)
  const target = state.workbook.sheet(sheet.id)
  if (!target) return []
  const cells = state.workbook.store.getter(target.sheetAtom)
  const out: SparseCellWire[] = []
  for (const { row, col } of collectCellsInBounds(cells, bounds)) {
    const sparse = readSparseCell(state, sheet, row, col)
    if (sparse) out.push(sparse)
  }
  out.sort((left, right) => (left.row === right.row ? left.col - right.col : left.row - right.row))
  return out
}

export function readSparseRange(state: RuntimeState, range: SparseRangeWire): CellSnapshotWire[] {
  const sheet = assertSheetIdx(state, range.sheet)
  const bounds = clampRangeToSheet(range)
  const target = state.workbook.sheet(sheet.id)
  if (!target) return []
  const cells = state.workbook.store.getter(target.sheetAtom)
  const out: CellSnapshotWire[] = []
  for (const { row, col, cell } of collectCellsInBounds(cells, bounds)) {
    const value = readCellValue(state, sheet, row, col)
    if (value.kind === 'blank' && !cell.input.startsWith('=')) continue
    out.push(readCellSnapshot(state, sheet, row, col))
  }
  for (const { row, col } of collectSpillTargets(state, sheet, bounds)) {
    out.push(readCellSnapshot(state, sheet, row, col))
  }
  out.sort((left, right) => {
    const leftCoord = parseA1(left.addr)
    const rightCoord = parseA1(right.addr)
    if (!leftCoord || !rightCoord) return 0
    return leftCoord.row === rightCoord.row
      ? leftCoord.col - rightCoord.col
      : leftCoord.row - rightCoord.row
  })
  return out
}

export function snapshotSparse(state: RuntimeState): SparseCellWire[] {
  return state.sheets.flatMap((sheet) =>
    snapshotRangeSparse(state, {
      sheet: sheet.idx,
      startRow: 0,
      startCol: 0,
      endRow: Number.MAX_SAFE_INTEGER,
      endCol: Number.MAX_SAFE_INTEGER,
    }),
  )
}

export function clearRange(state: RuntimeState, range: SparseRangeWire): number {
  const sheet = assertSheetIdx(state, range.sheet)
  return state.workbook.clearRange(sheet.id, clampRangeToSheet(range), 'all')
}
