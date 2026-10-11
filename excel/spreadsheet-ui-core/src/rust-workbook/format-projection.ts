import type { DisplayCell, SpreadsheetCellFormat, SpreadsheetNumberFormat } from '../backend'
import { isDefaultFormat, toA1 } from '../backend'
import type { CellRange } from '../shared'
import { formatNumberValue } from '../operations/format/numberFormat'
import type { RustFormatRangeSnapshot, RustSparseCellStyle, WasmWorkbook } from './wasm-types'

/** 生产读取原生条件格式快照；旧单测假件仅提供基础格式接口。 */
export function readDisplayFormats(
  workbook: WasmWorkbook, sheet: number, range: CellRange,
): RustFormatRangeSnapshot {
  const read = workbook.snapshot_display_format_range ?? workbook.snapshot_format_range
  if (!read) throw new Error('Rust format snapshot is unavailable.')
  return read.call(workbook, sheet, range.rowStart, range.colStart, range.rowEnd, range.colEnd)
}

function applyStyle(
  target: SpreadsheetCellFormat,
  style: RustSparseCellStyle | undefined,
): SpreadsheetCellFormat {
  if (!style) return target
  const result = { ...target } as Record<string, unknown>
  for (const [field, value] of Object.entries(style)) {
    // WASM 的 Some(None) 会序列化成显式 undefined；缺省字段根本不在 entries 中。
    if (value === null || value === undefined) delete result[field]
    else result[field] = value
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

/** 原生返回的显示文本也用于自动尺寸测量，不能再经过 JS 近似格式化。 */
export function usesNativeNumberDisplay(kind: SpreadsheetNumberFormat['kind']): boolean {
  return kind === 'text' || kind === 'date' || kind === 'time' || kind === 'scientific' ||
    kind === 'fraction' || kind === 'number' || kind === 'decimal' || kind === 'percent' ||
    kind === 'percentage' || kind === 'currency'
}

function formattedDisplayValue(cell: DisplayCell, format: SpreadsheetCellFormat): string {
  const numberFormat = format.numberFormat
  if (
    cell.numericValue === undefined ||
    numberFormat === undefined ||
    numberFormat.kind === 'general' || usesNativeNumberDisplay(numberFormat.kind)
  ) {
    return cell.displayValue
  }
  return formatNumberValue(numberFormat, cell.numericValue, { locale: format.locale }).text
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
  const dataBars = new Map((snapshot.dataBars ?? []).map(({ addr, ...bar }) => {
    if (![bar.left, bar.width, ...(bar.axis === undefined ? [] : [bar.axis])]
      .every((value) => Number.isFinite(value) && value >= 0 && value <= 100)
      || bar.left + bar.width > 100.000001 || !/^#[0-9a-f]{6}$/i.test(bar.color))
      throw new Error('Rust returned invalid data-bar geometry.')
    return [addr, bar] as const
  }))
  const result: DisplayCell[] = []

  for (let row = window.rowStart; row <= window.rowEnd; row += 1) {
    for (let col = window.colStart; col <= window.colEnd; col += 1) {
      const source = cellsByCoordinate.get(`${row}:${col}`)
      const dataBar = dataBars.get(toA1(row, col))
      const cell = source && { ...source, dataBar }
      const format = formatAt(cellStyles, rowStyles, columnStyles, row, col)
      if (cell) {
        result.push(
          !isDefaultFormat(format)
            ? { ...cell, displayValue: formattedDisplayValue(cell, format), format }
            : cell,
        )
      } else if (!isDefaultFormat(format)) {
        result.push({ row, col, displayValue: '', valueKind: 'blank', format })
      }
    }
  }

  return result
}
