import {
  CLIPBOARD_ORIGIN_MARKER_PREFIX,
  type CellCoord,
  type CellRange,
  type ClipboardTextData,
  type MenuTarget,
  type RangeProjectionResult,
  type SpreadsheetError,
} from '@einfach/spreadsheet-ui-core'

export const CLIPBOARD_CELL_LIMIT = 10_000

export function targetToRange(target: MenuTarget): CellRange | null {
  if (target.kind === 'cell') {
    const cell = target.cell
    return { rowStart: cell.row, rowEnd: cell.row, colStart: cell.col, colEnd: cell.col }
  }
  if (target.kind === 'range') return { ...target.range }
  return null
}

export function dataRangeFromOrigin(
  origin: CellCoord,
  rowCount: number,
  colCount: number,
): CellRange {
  return {
    rowStart: origin.row,
    rowEnd: origin.row + Math.max(1, rowCount) - 1,
    colStart: origin.col,
    colEnd: origin.col + Math.max(1, colCount) - 1,
  }
}

export function rangeCellCount(range: CellRange): number {
  if (range.rowEnd < range.rowStart || range.colEnd < range.colStart) return 0
  return (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
}

export function addClipboardOriginMarker(text: string, originAddr: string): string {
  return `${CLIPBOARD_ORIGIN_MARKER_PREFIX}${originAddr}\n${text}`
}

export function clipboardError(message: string): SpreadsheetError {
  return { code: 'BACKEND_ERROR', message }
}

export function toA1(coord: CellCoord): string {
  let value = coord.col + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return `${label}${coord.row + 1}`
}

/** Builds the canonical clipboard payload while omitting filter-hidden rows. */
export function resultToClipboardText(
  result: RangeProjectionResult,
  range: CellRange,
  hiddenRows: ReadonlySet<number>,
): ClipboardTextData {
  const cellsByKey = new Map<string, RangeProjectionResult['cells'][number]>()
  for (const cell of result.cells) cellsByKey.set(`${cell.row}:${cell.col}`, cell)

  const cells: string[][] = []
  let firstEmittedRow = -1
  for (let row = range.rowStart; row <= range.rowEnd; row += 1) {
    if (hiddenRows.has(row)) continue
    if (firstEmittedRow === -1) firstEmittedRow = row
    const fields: string[] = []
    for (let col = range.colStart; col <= range.colEnd; col += 1) {
      const cell = cellsByKey.get(`${row}:${col}`)
      fields.push(cell?.formula ?? cell?.displayValue ?? '')
    }
    cells.push(fields)
  }

  return {
    originAddr: toA1({
      row: firstEmittedRow === -1 ? range.rowStart : firstEmittedRow,
      col: range.colStart,
    }),
    cells,
  }
}

export async function writeClipboardText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export async function readClipboardText(): Promise<string | null> {
  try {
    return await navigator.clipboard.readText()
  } catch {
    return null
  }
}
