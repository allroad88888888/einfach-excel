import { getColumnLabel, type CellRange, type DrawingRange } from '@einfach-excel/spreadsheet-ui-core'

const EXCEL_MAX_ROWS = 1_048_576
const EXCEL_MAX_COLS = 16_384
const CELL = /^\$?([A-Za-z]{1,3})\$?(\d{1,7})$/
/** 不加引号也能写的表名：字母、数字、下划线、点，且不以数字开头。 */
const PLAIN_SHEET = /^[A-Za-z_À-￿][\w.À-￿]*$/

/** 解析与显示表名用的工作表目录；`ownerId` 是图表所在表，指向它的引用不写表名。 */
export interface SheetDirectory {
  readonly sheets: readonly { readonly id: string; readonly name: string }[]
  readonly ownerId: string
}

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

/** `'It''s'!A1` → It's；无引号时原样。 */
function sheetNameOf(text: string): string {
  const name = text.trim()
  return name.startsWith('\'') && name.endsWith('\'') && name.length > 1
    ? name.slice(1, -1).replace(/''/g, '\'') : name
}

/**
 * A1 区域文本（如 B2:D10、$B$2:$D$10、Data!A1:B5、'My data'!A1:B5），反向书写也规范成左上到右下。
 * 表名按 Excel 不区分大小写；没有目录或表名找不到时无效。
 */
export function parseRangeText(text: string, directory?: SheetDirectory): DrawingRange | null {
  const bang = text.lastIndexOf('!')
  let sheetId: string | undefined
  if (bang >= 0) {
    const name = sheetNameOf(text.slice(0, bang)).toLowerCase()
    const sheet = directory?.sheets.find((entry) => entry.name.toLowerCase() === name)
    if (!sheet) return null
    if (sheet.id !== directory!.ownerId) sheetId = sheet.id
  }
  const [first, second, extra] = text.slice(bang + 1).split(':')
  if (extra !== undefined || !first) return null
  const a = parseCell(first)
  const b = second === undefined ? a : parseCell(second)
  if (!a || !b) return null
  return {
    ...(sheetId ? { sheetId } : {}),
    startRow: Math.min(a.row, b.row), startCol: Math.min(a.col, b.col),
    endRow: Math.max(a.row, b.row), endCol: Math.max(a.col, b.col),
  }
}

function quoteSheet(name: string): string {
  return PLAIN_SHEET.test(name) ? name : `'${name.replace(/'/g, '\'\'')}'`
}

/** 指向其他表时带表名；那张表已不在目录里（被删）显示 #REF!。 */
export function formatRangeText(range: DrawingRange | null | undefined,
  directory?: SheetDirectory): string {
  if (!range) return '#REF!'
  const start = `${getColumnLabel(range.startCol)}${range.startRow + 1}`
  const end = `${getColumnLabel(range.endCol)}${range.endRow + 1}`
  const cells = start === end ? start : `${start}:${end}`
  if (!range.sheetId || range.sheetId === directory?.ownerId) return cells
  const sheet = directory?.sheets.find((entry) => entry.id === range.sheetId)
  return sheet ? `${quoteSheet(sheet.name)}!${cells}` : '#REF!'
}

export function toCellRange(range: DrawingRange): CellRange {
  return { rowStart: range.startRow, rowEnd: range.endRow,
    colStart: range.startCol, colEnd: range.endCol }
}

export function rangeCellCount(range: DrawingRange): number {
  return (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1)
}

/** 多区域文本，逗号分隔（如 A3:A15,C3:C15）；任一段非法则整体无效。表名里的逗号需加引号。 */
export function parseRangesText(text: string, directory?: SheetDirectory): DrawingRange[] | null {
  const parts = splitAreas(text)
  if (!parts.length || parts.some((part) => !part)) return null
  const ranges = parts.map((part) => parseRangeText(part, directory))
  return ranges.every((range): range is DrawingRange => range !== null) ? ranges : null
}

function splitAreas(text: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  for (const char of text) {
    if (char === '\'') quoted = !quoted
    if (char === ',' && !quoted) {
      parts.push(current.trim())
      current = ''
    } else current += char
  }
  parts.push(current.trim())
  return parts
}

export function formatRangesText(ranges: readonly (DrawingRange | null)[],
  directory?: SheetDirectory): string {
  return ranges.length ? ranges.map((range) => formatRangeText(range, directory)).join(',') : '#REF!'
}
