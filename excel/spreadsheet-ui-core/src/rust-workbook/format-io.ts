import type { SetFormatRangeRequest } from '../backend'
import type { RustImportCell } from './commands'
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

/** 将导入数据携带的稀疏单元格格式写入 Rust。 */
export function writeImportedCellFormats(
  workbook: WasmWorkbook,
  cells: readonly RustImportCell[],
): void {
  const setFormatRange = requiredSetFormatRange(workbook)
  for (const cell of cells) {
    if (cell.format === undefined || cell.sheet >= workbook.sheet_count()) continue
    setFormatRange.call(
      workbook,
      cell.sheet,
      cell.row,
      cell.col,
      cell.row,
      cell.col,
      cell.format,
    )
  }
}
