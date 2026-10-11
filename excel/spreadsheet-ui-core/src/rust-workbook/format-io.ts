import type { SetFormatRangeRequest } from '../backend'
import type { WasmWorkbook } from './wasm-types'

function requiredSetFormatRange(
  workbook: WasmWorkbook,
): NonNullable<WasmWorkbook['set_format_range']> {
  if (workbook.set_format_range) return workbook.set_format_range
  throw Object.assign(new Error('WasmWorkbook.set_format_range is unavailable'), {
    code: 'WASM_METHOD_UNAVAILABLE',
  })
}

/** 将一条区域格式命令直接提交给 Rust。 */
export function writeRangeFormat(
  workbook: WasmWorkbook,
  sheet: number,
  request: SetFormatRangeRequest,
): void {
  const range = request.range
  if (request.borderPatch) {
    if (!workbook.patch_range_borders) throw new Error('WasmWorkbook.patch_range_borders is unavailable')
    workbook.patch_range_borders(
      sheet, range.rowStart, range.colStart, range.rowEnd, range.colEnd, request.borderPatch,
    )
    return
  }
  if (request.writeMode === 'patch') {
    const patchFormatRange = workbook.patch_format_range
    if (!patchFormatRange) {
      throw Object.assign(new Error('WasmWorkbook.patch_format_range is unavailable'), {
        code: 'WASM_METHOD_UNAVAILABLE',
      })
    }
    if (request.format === null) return
    const patch: Record<string, unknown> = { ...request.format }
    for (const field of request.clearFormatFields ?? []) patch[field] = null
    patchFormatRange.call(
      workbook,
      sheet,
      range.rowStart,
      range.colStart,
      range.rowEnd,
      range.colEnd,
      patch,
      request.scope ?? 'cell',
    )
    return
  }
  requiredSetFormatRange(workbook).call(
    workbook,
    sheet,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
    request.format,
  )
}
