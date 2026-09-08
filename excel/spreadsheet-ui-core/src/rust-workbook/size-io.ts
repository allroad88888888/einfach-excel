import type { CellRange } from '../shared'
import type { WasmWorkbook } from './wasm-types'
import type { RustWorkbookSheetInput, RustWorkbookCommands } from './commands'
import { createAutoFitMeasurer } from './auto-fit-measurement'

/** 自动适应仍是一条尺寸命令；测量失败时原生保证不写入任何尺寸。 */
export function autoFitRange(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustWorkbookCommands['range.resize']['payload'],
): boolean {
  const { range, axis, projection, autoFit } = input
  if (!autoFit || axis === 'reset' || !projection.viewport)
    throw new Error('Invalid auto-fit command.')
  const { rowHeight, colWidth } = projection.viewport
  if (
    ![range.rowStart, range.rowEnd, range.colStart, range.colEnd, rowHeight, colWidth].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff,
    )
  )
    throw new Error('Auto-fit coordinates and default sizes must be non-negative integers.')
  if (!workbook.auto_fit_dimensions) throw new Error('Rust auto-fit command is unavailable.')
  return workbook.auto_fit_dimensions(
    sheet,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
    axis,
    rowHeight,
    colWidth,
    createAutoFitMeasurer(axis, autoFit),
  )
}

/** JS 数值进入 u32 WASM 参数前拒绝截断/溢出；业务尺寸范围仍由 Rust 校验。 */
export function resizeRange(
  workbook: WasmWorkbook,
  sheet: number,
  range: CellRange,
  axis: 'row' | 'column' | 'reset',
  pixels: number,
): void {
  if (
    ![range.rowStart, range.rowEnd, range.colStart, range.colEnd, pixels].every(
      (n) => Number.isSafeInteger(n) && n >= 0 && n <= 0xffffffff,
    )
  )
    throw new Error('Size coordinates and pixels must be non-negative integers.')
  if (!workbook.resize_range) throw new Error('Rust size command is unavailable.')
  workbook.resize_range(
    sheet,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
    axis,
    pixels,
  )
}

/** 稀疏尺寸从 Rust 读取；只传回坐标缓存需要的数字。 */
export function readSizes(workbook: WasmWorkbook, sheet: number, range: CellRange) {
  if (!workbook.snapshot_viewport_sizes) throw new Error('Rust size snapshot is unavailable.')
  const sizes = workbook.snapshot_viewport_sizes(
    sheet,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
  )
  return { rowHeights: sizes.rowHeights ?? [], colWidths: sizes.colWidths ?? [] }
}

/** 初始化尺寸仍走原生尺寸命令，不把行列属性塞进单元格导入数据。 */
export function importSheetSizes(
  workbook: WasmWorkbook,
  sheet: number,
  input: RustWorkbookSheetInput,
) {
  for (const { rowIndex, heightPx } of input.rowHeights ?? []) {
    resizeRange(
      workbook,
      sheet,
      { rowStart: rowIndex, rowEnd: rowIndex, colStart: 0, colEnd: 0 },
      'row',
      heightPx,
    )
  }
  for (const { colIndex, widthPx } of input.colWidths ?? []) {
    resizeRange(
      workbook,
      sheet,
      { rowStart: 0, rowEnd: 0, colStart: colIndex, colEnd: colIndex },
      'column',
      widthPx,
    )
  }
}
