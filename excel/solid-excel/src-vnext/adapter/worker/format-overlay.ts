// 一句话：把引擎的格式快照挂到投影单元格上。

import type {
  CellRange,
  DisplayCell,
  RangeFormatLayer,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import { getEffectiveFormat, keyFor, normalizeFormat } from '@einfach/spreadsheet-ui-core'
import type { FormatRangeSnapshot, SparseRangeWire } from '../worker-protocol'
import { parseA1 } from './wire-range'

/** Truthful overlay for runtimes that model no formats (`formatSnapshots: false`). */
export function emptyFormatRangeSnapshot(range: SparseRangeWire): FormatRangeSnapshot {
  return {
    sheet: range.sheet,
    startRow: range.startRow,
    startCol: range.startCol,
    endRow: range.endRow,
    endCol: range.endCol,
    cellFormats: [],
    rangeFormats: [],
  }
}

export function preprocessFormatSnapshot(snapshot: FormatRangeSnapshot): {
  cellFormats: Map<string, SpreadsheetCellFormat>
  rangeFormats: RangeFormatLayer[]
} {
  // Skip default-looking cell-format entries so they cannot mask an underlying
  // range layer in getEffectiveFormat. This preserves the semantics of the
  // pre-refactor worker which ran normalizeFormat on each entry.
  const cellFormats = new Map<string, SpreadsheetCellFormat>()
  for (const entry of snapshot.cellFormats) {
    const coord = parseA1(entry.addr)
    if (!coord) continue
    const normalized = normalizeFormat(entry.format)
    if (!normalized) continue
    cellFormats.set(keyFor(coord.row, coord.col), normalized)
  }

  const rangeFormats: RangeFormatLayer[] = snapshot.rangeFormats.map((layer) => ({
    range: {
      rowStart: layer.startRow,
      rowEnd: layer.endRow,
      colStart: layer.startCol,
      colEnd: layer.endCol,
    },
    format: layer.format,
  }))

  return { cellFormats, rangeFormats }
}

function attachFormatsToCells(
  cells: DisplayCell[],
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: readonly RangeFormatLayer[],
): DisplayCell[] {
  return cells.map((cell) => {
    const format = getEffectiveFormat(cell.row, cell.col, cellFormats, rangeFormats)
    return format ? { ...cell, format } : cell
  })
}

function fillBlankFormatOnlyCells(
  cellMap: Map<string, DisplayCell>,
  range: CellRange,
  cellFormats: Map<string, SpreadsheetCellFormat>,
  rangeFormats: readonly RangeFormatLayer[],
): void {
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const key = keyFor(row, col)
      if (cellMap.has(key)) continue
      const format = getEffectiveFormat(row, col, cellFormats, rangeFormats)
      if (!format) continue
      cellMap.set(key, {
        row,
        col,
        displayValue: '',
        valueKind: 'blank',
        format,
      })
    }
  }
}

export function mergeFormatsIntoCells(
  cells: DisplayCell[],
  range: CellRange,
  snapshot: FormatRangeSnapshot,
): DisplayCell[] {
  const { cellFormats, rangeFormats } = preprocessFormatSnapshot(snapshot)
  const formatted = attachFormatsToCells(cells, cellFormats, rangeFormats)
  const cellMap = new Map<string, DisplayCell>()
  for (const cell of formatted) cellMap.set(keyFor(cell.row, cell.col), cell)
  fillBlankFormatOnlyCells(cellMap, range, cellFormats, rangeFormats)
  return [...cellMap.values()].sort((left, right) =>
    left.row === right.row ? left.col - right.col : left.row - right.row,
  )
}
