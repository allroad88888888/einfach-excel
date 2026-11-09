import type { DrawingRange } from '@einfach-excel/spreadsheet-ui-core'

const CELL = /^\$?([A-Za-z]{1,3})\$?([1-9][0-9]{0,6})$/
const MAX_ROWS = 1_048_576
const MAX_COLS = 16_384

function cell(text: string): { row: number; col: number } | null {
  const match = CELL.exec(text.trim())
  if (!match) return null
  const letters = [...match[1]!.toUpperCase()]
  const col = letters.reduce((sum, c) => sum * 26 + c.charCodeAt(0) - 64, 0) - 1
  const row = Number(match[2]) - 1
  return row < MAX_ROWS && col < MAX_COLS ? { row, col } : null
}

/** 同表 A1 区域：`B2:F2`、`$B$2:$F$2` 或单格 `G2`。跨表引用不支持（同 Excel 的位置范围）。 */
export function parseRange(text: string): DrawingRange | null {
  const [first, second, extra] = text.split(':')
  if (extra !== undefined || !first) return null
  const start = cell(first)
  const end = second === undefined ? start : cell(second)
  if (!start || !end) return null
  return { startRow: Math.min(start.row, end.row), endRow: Math.max(start.row, end.row),
    startCol: Math.min(start.col, end.col), endCol: Math.max(start.col, end.col) }
}

function label(row: number, col: number): string {
  let name = ''
  for (let n = col + 1; n > 0; n = Math.floor((n - 1) / 26))
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name
  return `${name}${row + 1}`
}

export function formatRange(range: DrawingRange): string {
  const start = label(range.startRow, range.startCol)
  const end = label(range.endRow, range.endCol)
  return start === end ? start : `${start}:${end}`
}
