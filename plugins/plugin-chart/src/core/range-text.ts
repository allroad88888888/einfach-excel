import { getColumnLabel, type CellRange, type DrawingRange } from '@einfach-excel/spreadsheet-ui-core'

const EXCEL_MAX_ROWS = 1_048_576
const EXCEL_MAX_COLS = 16_384
const CELL = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/

function columnIndex(letters: string): number {
  return [...letters.toUpperCase()].reduce((sum, char) => sum * 26 + char.charCodeAt(0) - 64, 0) - 1
}

function parseCell(text: string): { row: number; col: number } | null {
  const match = CELL.exec(text.trim())
  if (!match) return null
  const col = columnIndex(match[1]!)
  const row = Number(match[2]) - 1
  return row >= 0 && row < EXCEL_MAX_ROWS && col >= 0 && col < EXCEL_MAX_COLS ? { row, col } : null
}

/** 同表 A1 区域文本（如 B2:D10、$B$2:$D$10），反向书写也规范成左上到右下；不支持跨表。 */
export function parseRangeText(text: string): DrawingRange | null {
  const [first, second, extra] = text.split(':')
  if (extra !== undefined || !first) return null
  const a = parseCell(first)
  const b = second === undefined ? a : parseCell(second)
  if (!a || !b) return null
  return {
    startRow: Math.min(a.row, b.row), startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row), endCol: Math.max(a.col, b.col),
  }
}

export function formatRangeText(range: DrawingRange | null | undefined): string {
  if (!range) return '#REF!'
  const start = `${getColumnLabel(range.startCol)}${range.startRow + 1}`
  const end = `${getColumnLabel(range.endCol)}${range.endRow + 1}`
  return start === end ? start : `${start}:${end}`
}

export function toCellRange(range: DrawingRange): CellRange {
  return { rowStart: range.startRow, rowEnd: range.endRow,
    colStart: range.startCol, colEnd: range.endCol }
}

export function rangeCellCount(range: DrawingRange): number {
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1)
}

/** 多区域文本，逗号分隔（如 A3:A15,C3:C15）；任一段非法则整体无效。 */
export function parseRangesText(text: string): DrawingRange[] | null {
  const parts = text.split(',').map((part) => part.trim())
  if (!parts.length || parts.some((part) => !part)) return null
  const ranges = parts.map(parseRangeText)
  return ranges.every((range): range is DrawingRange => range !== null) ? ranges : null
}

export function formatRangesText(ranges: readonly (DrawingRange | null)[]): string {
  return ranges.length ? ranges.map(formatRangeText).join(',') : '#REF!'
}
