import type { RustClearRangeRequest } from './commands'
import type { WasmWorkbook } from './wasm-types'

/** 只转交目标与模式；默认样式、预检和一次撤销全部由 Rust 承担。 */
export function clearRange(workbook: WasmWorkbook, sheet: number, request: RustClearRangeRequest) {
  if (!workbook.clear_selection) throw new Error('Rust clear_selection is unavailable')
  return workbook.clear_selection({
    sheet,
    mode: request.mode,
    targets: request.targets ?? [{ ...request.range, scope: request.scope }],
  })
}
