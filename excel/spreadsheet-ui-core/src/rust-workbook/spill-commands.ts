import type { CellCoord, CellRange } from '../shared'
import type { WorkerCommand } from '../rust-worker'
import { coordToA1, parseA1Cell } from '../name-box/address'
import { EXCEL_MAX_COLS, EXCEL_MAX_ROWS } from '../shared/grid-coordinates'
import type { WasmWorkbook } from './wasm-types'

export type SpillInspection =
  | { readonly kind: 'none' }
  | { readonly kind: 'active'; readonly anchor: CellCoord; readonly range: CellRange }
  | { readonly kind: 'blocked'; readonly anchor: CellCoord; readonly blocker: CellCoord | null }

/** 已有 WASM 查询的类型声明；不重新维护溢出索引。 */
export interface WasmSpillQueries {
  spillAnchor?: (sheet: number, address: string) => string | null
  spillInfo?: (sheet: number, address: string) => Uint32Array | null
  spillBlocker?: (sheet: number, address: string) => string | null
}
export interface RustSpillCommands {
  readonly 'formula.inspectSpill': WorkerCommand<
    { readonly sheetId: string; readonly cell: CellCoord },
    { readonly inspection: SpillInspection; readonly revision: number }
  >
}

/** 只查活动格及其原生锚点，不遍历整个窗口，更不从公式文本猜数组尺寸。 */
export function inspectSpill(
  workbook: WasmWorkbook, sheet: number, cell: CellCoord,
): SpillInspection {
  if (!cell || !Number.isSafeInteger(cell.row) || !Number.isSafeInteger(cell.col) ||
    cell.row < 0 || cell.col < 0 || cell.row >= EXCEL_MAX_ROWS || cell.col >= EXCEL_MAX_COLS)
    throw new Error('Invalid spill cell address.')
  if (!workbook.spillAnchor || !workbook.spillInfo || !workbook.spillBlocker ||
    !workbook.read_sparse_range)
    throw new Error('Rust spill inspection is unavailable.')
  // 原生稀疏读取负责求值，包括懒导入；错误类型来自 Rust，不把字面文本 #SPILL! 当错误。
  const value = workbook.read_sparse_range(sheet, cell.row, cell.col, cell.row, cell.col)[0]
  const address = coordToA1(cell)
  const anchorAddress = workbook.spillAnchor(sheet, address) ?? address
  const anchor = parseA1Cell(anchorAddress)
  if (!anchor) throw new Error('Rust returned an invalid spill anchor.')
  const shape = workbook.spillInfo(sheet, anchorAddress)
  if (shape) {
    const [rows, cols] = shape
    const range = { rowStart: anchor.row, colStart: anchor.col,
      rowEnd: anchor.row + rows - 1, colEnd: anchor.col + cols - 1 }
    if (shape.length !== 2 || !Number.isSafeInteger(rows) || !Number.isSafeInteger(cols) ||
      rows < 1 || cols < 1 || range.rowEnd >= EXCEL_MAX_ROWS || range.colEnd >= EXCEL_MAX_COLS)
      throw new Error('Rust returned an invalid spill range.')
    return { kind: 'active', anchor, range }
  }
  if (value?.isError && value.display === '#SPILL!') {
    const blockedAddress = workbook.spillBlocker(sheet, address)
    const blocker = blockedAddress === null ? null : parseA1Cell(blockedAddress)
    if (blockedAddress !== null && !blocker) throw new Error('Rust returned an invalid spill blocker.')
    return { kind: 'blocked', anchor: cell, blocker }
  }
  return { kind: 'none' }
}
