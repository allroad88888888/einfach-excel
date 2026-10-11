import type { SetCellInputRequest, SetFormatRangeRequest } from '../backend'
import type { RustClearRangeRequest, RustFillRangeRequest } from './commands'
import { fillRange } from './fill-io'
import { writeCellInput } from './cell-io'
import { clearRange } from './clear-io'
import { writeRangeFormat } from './format-io'
import { historyFormatRange, withHistory } from './history-io'
import type { WasmWorkbook } from './wasm-types'

/** 将现有原生写入归入一个撤销步骤；这里不读取或保存格子数据。 */
export function writeTrackedMutation(
  workbook: WasmWorkbook,
  sheet: number,
  request:
    | SetCellInputRequest | SetFormatRangeRequest | RustClearRangeRequest | RustFillRangeRequest,
) {
  if ('direction' in request) return fillRange(workbook, sheet, request)
  // 共边邻格的撤销范围由 Rust 计算，不能再套一个较窄的 JS 事务。
  if ('borderPatch' in request && request.borderPatch) {
    writeRangeFormat(workbook, sheet, request)
    return { ...request.range }
  }
  if ('row' in request) {
    const range = {
      rowStart: request.row,
      rowEnd: request.row,
      colStart: request.col,
      colEnd: request.col,
    }
    // Rust 根据输入位置决定普通编辑或表头改名，并在原生侧记录一条完整历史。
    writeCellInput(workbook, sheet, request.row, request.col, request.input, request.expandTables)
    return range
  }
  const clearing = 'mode' in request
  const content = clearing && request.mode !== 'formats'
  const range = historyFormatRange(
    request.range,
    clearing && request.mode === 'contents' ? 'cell' : (request.scope ?? 'cell'),
  )
  withHistory(
    workbook,
    sheet,
    range,
    clearing ? `Clear ${request.mode}` : 'Format selection',
    content,
    () => {
      if (clearing) clearRange(workbook, sheet, request)
      else writeRangeFormat(workbook, sheet, request)
    },
  )
  return { ...request.range }
}
