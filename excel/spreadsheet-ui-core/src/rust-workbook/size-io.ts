import type { CellRange } from '../shared'
import type { WasmWorkbook } from './wasm-types'
import type { RustWorkbookSheetInput } from './commands'

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
