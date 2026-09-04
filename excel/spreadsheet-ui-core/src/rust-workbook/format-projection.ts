import type { DisplayCell, SpreadsheetCellFormat } from '../backend'
import { isDefaultFormat, toA1 } from '../backend'
import type { CellRange } from '../shared'
import type { RustFormatRangeSnapshot, RustSparseCellStyle } from './wasm-types'

function applyStyle(
  target: SpreadsheetCellFormat,
  style: RustSparseCellStyle | undefined,
): SpreadsheetCellFormat {
  if (!style) return target
  const result = { ...target } as Record<string, unknown>
  for (const [field, value] of Object.entries(style)) {
    if (value === null) delete result[field]
    else if (value !== undefined) result[field] = value
  }
  return result as SpreadsheetCellFormat
}

function formatAt(
  cellStyles: ReadonlyMap<string, RustSparseCellStyle>,
  rowStyles: ReadonlyMap<number, RustSparseCellStyle>,
  columnStyles: ReadonlyMap<number, RustSparseCellStyle>,
  row: number,
  col: number,
): SpreadsheetCellFormat {
  let format: SpreadsheetCellFormat = {}
  format = applyStyle(format, columnStyles.get(col))
  format = applyStyle(format, rowStyles.get(row))
  return applyStyle(format, cellStyles.get(toA1(row, col)))
}

/** 只在可见窗口内解析 Rust 的三类稀疏样式。 */
export function applyVisibleFormats(
  cells: readonly DisplayCell[],
  window: CellRange,
  snapshot: RustFormatRangeSnapshot,
): DisplayCell[] {
  const cellsByCoordinate = new Map(cells.map((cell) => [`${cell.row}:${cell.col}`, cell]))
  const cellStyles = new Map(snapshot.cellStyles.map((entry) => [entry.addr, entry.format]))
  const rowStyles = new Map(snapshot.rowStyles.map((entry) => [entry.index, entry.format]))
  const columnStyles = new Map(snapshot.columnStyles.map((entry) => [entry.index, entry.format]))
  const result: DisplayCell[] = []

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      const cell = cellsByCoordinate.get(`${row}:${col}`)
      const format = formatAt(cellStyles, rowStyles, columnStyles, row, col)
      if (cell) {
        result.push(!isDefaultFormat(format) ? { ...cell, format } : cell)
      } else if (!isDefaultFormat(format)) {
        result.push({ row, col, displayValue: '', valueKind: 'blank', format })
      }
    }
  }

  return result
}
