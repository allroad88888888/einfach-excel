import type { NativeDataValidationRule } from '../data-validation/native-rule'
import type { CellRange } from '../shared'
import type { VisibleProjectionRequest, VisibleProjectionResult } from '../contracts/projection-contracts'
import type { WorkerCommand } from '../rust-worker/types'
import type { WasmWorkbook } from './wasm-types'

export interface InvalidValidationCell {
  readonly row: number
  readonly col: number
}

export interface InvalidValidationReport {
  readonly cells: readonly InvalidValidationCell[]
  readonly truncated: boolean
}

export const DEFAULT_MAX_VALIDATION_CIRCLES = 1000

export interface RustDataValidationCommands {
  'validation.read': WorkerCommand<
    { readonly sheetId: string; readonly row: number; readonly col: number },
    NativeDataValidationRule | null
  >
  'validation.listInvalid': WorkerCommand<
    { readonly sheetId: string; readonly maxCount?: number },
    InvalidValidationReport & { readonly revision: number }
  >
  'validation.change': WorkerCommand<{
    readonly sheetId: string
    readonly range: CellRange
    readonly rule: NativeDataValidationRule | null
    readonly projection: VisibleProjectionRequest
  }, { readonly projection: VisibleProjectionResult }>
}

export function listInvalidValidationCells(
  workbook: WasmWorkbook,
  sheet: number,
  maxCount: number | undefined,
  revision: number,
): InvalidValidationReport & { readonly revision: number } {
  if (!workbook.listInvalidValidationCells) {
    throw new Error('Rust data validation is unavailable.')
  }
  const bound =
    maxCount !== undefined && Number.isSafeInteger(maxCount) && maxCount > 0
      ? Math.min(maxCount, DEFAULT_MAX_VALIDATION_CIRCLES)
      : DEFAULT_MAX_VALIDATION_CIRCLES
  const report = workbook.listInvalidValidationCells(sheet, bound)
  return { ...report, revision }
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
