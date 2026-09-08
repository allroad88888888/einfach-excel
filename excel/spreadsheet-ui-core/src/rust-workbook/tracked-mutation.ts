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
  if ('row' in request) {
    const range = {
      rowStart: request.row,
      rowEnd: request.row,
      colStart: request.col,
      colEnd: request.col,
    }
    withHistory(workbook, sheet, range, 'Edit cell', true, () =>
      writeCellInput(workbook, sheet, request.row, request.col, request.input),
    )
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
