import type { CellRange } from '../shared'
import type { WasmWorkbook } from './wasm-types'

/** 一个 Worker 命令内给原生写入分组；所有历史快照始终留在 Rust。 */
export function withHistory<T>(
  workbook: WasmWorkbook,
  sheet: number,
  range: CellRange,
  label: string,
  content: boolean,
  write: () => T,
): T {
  if (!workbook.history_begin) return write()
  if (!workbook.history_finish) throw new Error('Rust history finish is unavailable.')
  workbook.history_begin(
    sheet,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
    label,
    content,
  )
  let result: T
  try {
    result = write()
  } catch (error) {
    workbook.history_finish(false)
    throw error
  }
  workbook.history_finish(true)
  return result
}

/** 行列样式会影响交叉点的覆盖，历史范围必须覆盖完整的源行/列。 */
export function historyFormatRange(range: CellRange, scope: 'cell' | 'row' | 'column'): CellRange {
  return scope === 'row'
    ? { ...range, colStart: 0, colEnd: 16383 }
    : scope === 'column'
      ? { ...range, rowStart: 0, rowEnd: 1048575 }
      : range
}
