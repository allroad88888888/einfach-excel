import type { RustWorkbookCommands } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { autoFitRange, resizeRange } from './size-io'
import { withHistory } from './history-io'

/** 尺寸命令共用原生历史；不读取投影，调用方先推进版本再读取。 */
export function changeSize(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustWorkbookCommands['range.resize']['payload'],
): void {
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (!workbook.snapshot_viewport_sizes) throw new Error('Rust size snapshot is unavailable.')
  withHistory(
    workbook,
    sheet,
    input.range,
    input.autoFit
      ? `Auto-fit ${input.axis}`
      : input.axis === 'reset'
        ? 'Reset sizes'
        : `Resize ${input.axis}`,
    false,
    () =>
      input.autoFit
        ? autoFitRange(workbook, sheet, input)
        : resizeRange(workbook, sheet, input.range, input.axis, input.pixels),
  )
}
