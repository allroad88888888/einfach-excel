import type { NativeDataValidationRule } from '../data-validation/native-rule'
import type { CellRange } from '../shared'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../backend/projection-contracts'
import type { WorkerCommand } from '../rust-worker/types'
import type { WasmWorkbook } from './wasm-types'

export interface RustDataValidationCommands {
  'validation.read': WorkerCommand<
    { readonly sheetId: string; readonly row: number; readonly col: number },
    NativeDataValidationRule | null
  >
  'validation.change': WorkerCommand<{
    readonly sheetId: string
    readonly range: CellRange
    readonly rule: NativeDataValidationRule | null
    readonly projection: VisibleProjectionRequest
  }, { readonly projection: VisibleProjectionResult }>
}

/** 只检查命令目标，定义校验、值判断、历史都留在 Rust。 */
export function changeDataValidation(
  workbook: WasmWorkbook, sheet: number,
  input: RustDataValidationCommands['validation.change']['payload'],
  rows: number, cols: number,
): void {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  const { rowStart, rowEnd, colStart, colEnd } = input.range
  if (![rowStart, rowEnd, colStart, colEnd].every(Number.isSafeInteger) ||
    rowStart < 0 || colStart < 0 || rowEnd < rowStart || colEnd < colStart ||
    rowEnd >= rows || colEnd >= cols)
    throw new Error('Choose a data-validation range inside the worksheet.')
  if (!workbook.setDataValidation) throw new Error('Rust data validation is unavailable.')
  workbook.setDataValidation(sheet, rowStart, colStart, rowEnd, colEnd, input.rule)
}
