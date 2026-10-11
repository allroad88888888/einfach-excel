import type { CellCoord, CellRange } from '../shared'
import { EXCEL_MAX_COLS, EXCEL_MAX_ROWS } from '../shared/grid-coordinates'

const COLUMN_LABEL_PATTERN = /^([A-Za-z]+)(\d+)$/

function columnLabelToIndex(letters: string): number {
  if (letters.length === 0) return -1
  let col = 0
  for (let index = 0; index < letters.length; index += 1) {
    const code = letters.toUpperCase().charCodeAt(index) - 64
    if (code < 1 || code > 26) return -1
    col = col * 26 + code
  }
  return col - 1
}

function indexToColumnLabel(col: number): string {
  let current = col
  let label = ''
  do {
    label = String.fromCharCode(65 + (current % 26)) + label
    current = Math.floor(current / 26) - 1
  } while (current >= 0)
  return label
}

export function coordToA1(coord: CellCoord): string {
  return `${indexToColumnLabel(coord.col)}${coord.row + 1}`
}

export function rangeToA1(range: CellRange): string {
  if (range.rowStart === range.rowEnd && range.colStart === range.colEnd) {
    return coordToA1({ row: range.rowStart, col: range.colStart })
  }
  const start = coordToA1({ row: range.rowStart, col: range.colStart })
  const end = coordToA1({ row: range.rowEnd, col: range.colEnd })
  return `${start}:${end}`
}

export function parseA1Cell(input: string): CellCoord | null {
  const match = COLUMN_LABEL_PATTERN.exec(input.trim())
  if (!match) return null
  const col = columnLabelToIndex(match[1])
  const rowOneBased = Number(match[2])
  if (col < 0 || col >= EXCEL_MAX_COLS) return null
  if (!Number.isInteger(rowOneBased) || rowOneBased < 1 || rowOneBased > EXCEL_MAX_ROWS) {
    return null
  }
  return { row: rowOneBased - 1, col }
}

export function parseA1Range(input: string): CellRange | null {
  const trimmed = input.trim()
  const colonIndex = trimmed.indexOf(':')
  if (colonIndex < 0) return null
  const start = parseA1Cell(trimmed.slice(0, colonIndex))
  const end = parseA1Cell(trimmed.slice(colonIndex + 1))
  if (!start || !end) return null
  return {
    rowStart: Math.min(start.row, end.row),
    rowEnd: Math.max(start.row, end.row),
    colStart: Math.min(start.col, end.col),
    colEnd: Math.max(start.col, end.col),
  }
}
