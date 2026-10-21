import type { WasmWorkbook } from './wasm-types'

/** 只给本次精确原生验证错误附加一次性详情；其它错误不借用旧失败。 */
export function takeValidationErrorDetail(workbook: WasmWorkbook, error: unknown): unknown {
  const message = error instanceof Error ? error.message : String(error)
  const match = /^(?:auto-fill rejected: )?DATA_VALIDATION_(FAILED|WARNING|INFORMATION)$/.exec(message)
  if (!match || !workbook.getLastValidationFailure) return error
  const detail = workbook.getLastValidationFailure()
  if (!detail || typeof detail !== 'object') return error
  const value = detail as Record<string, unknown>
  const style = match[1] === 'FAILED' ? 'stop' : match[1].toLowerCase()
  if (
    value.style !== style ||
    typeof value.title !== 'string' ||
    typeof value.message !== 'string' ||
    ![value.sheet, value.row, value.col].every(
      (index) => Number.isSafeInteger(index) && Number(index) >= 0,
    )
  )
    return error
  return Object.assign(error instanceof Error ? error : new Error(message), { detail })
}
