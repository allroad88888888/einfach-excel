// 一句话：把宿主输入串翻译成写入用的线格式单元格。

import type { CellRange } from '@einfach/spreadsheet-ui-core'
import type { CellWire, ImportCellWire } from '../worker-protocol'

export function toCellWire(input: string): CellWire {
  const trimmed = input.trim()
  if (trimmed === '') {
    return { type: 'null' }
  }

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) {
    return { type: 'number', value: numeric }
  }

  return { type: 'text', value: trimmed }
}

export function toImportCellWire(
  sheet: number,
  row: number,
  col: number,
  input: string,
  preserveAsText?: boolean,
): ImportCellWire {
  // preserveAsText: bypass numeric inference and formula detection. The
  // input is forwarded verbatim as a text cell so `=A1` stays literal and
  // `00123` keeps its leading zeros. An empty string still clears the
  // cell.
  if (preserveAsText) {
    if (input.length === 0) {
      return { sheet, row, col, kind: 'null' }
    }
    return { sheet, row, col, kind: 'text', value: input }
  }

  const trimmed = input.trim()
  if (trimmed === '') {
    return { sheet, row, col, kind: 'null' }
  }
  if (trimmed.startsWith('=')) {
    return { sheet, row, col, kind: 'formula', value: trimmed }
  }

  const numeric = Number(trimmed)
  if (Number.isFinite(numeric)) {
    return { sheet, row, col, kind: 'number', value: numeric }
  }

  return { sheet, row, col, kind: 'text', value: trimmed }
}

export function boundingRangeOfImportCells(
  cells: readonly { row: number; col: number }[],
): CellRange | null {
  let range: CellRange | null = null
  for (const cell of cells) {
    if (!Number.isInteger(cell.row) || !Number.isInteger(cell.col)) continue
    if (cell.row < 0 || cell.col < 0) continue
    if (range === null) {
      range = { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col }
    } else {
      range.rowStart = Math.min(range.rowStart, cell.row)
      range.rowEnd = Math.max(range.rowEnd, cell.row)
      range.colStart = Math.min(range.colStart, cell.col)
      range.colEnd = Math.max(range.colEnd, cell.col)
    }
  }
  return range
}
