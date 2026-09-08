import type { RustWorkbookCommands, RustWorkbookSheet, RustWorkbookSheetInput } from './commands'
import type { WasmWorkbook } from './wasm-types'

/** 传输边界只校验整数/画布，不在 JS 计算隐藏集合或回放历史。 */
export function changeVisibility(
  workbook: WasmWorkbook,
  index: number,
  input: Pick<RustWorkbookCommands['range.visibility']['payload'], 'range' | 'action'>,
  sheet: Pick<RustWorkbookSheet, 'rowCount' | 'colCount'>,
): boolean {
  if (!workbook.set_visibility || !workbook.sheet_visibility)
    throw new Error('Rust visibility command is unavailable.')
  const range = input.range
  if (
    ![range.rowStart, range.colStart, range.rowEnd, range.colEnd].every(
      (n) => Number.isSafeInteger(n) && n >= 0,
    ) ||
    range.rowStart > range.rowEnd ||
    range.colStart > range.colEnd ||
    range.rowEnd >= (sheet.rowCount ?? 1_048_576) ||
    range.colEnd >= (sheet.colCount ?? 16_384)
  )
    throw new Error('Visibility range is outside the worksheet.')
  return workbook.set_visibility(
    index,
    range.rowStart,
    range.colStart,
    range.rowEnd,
    range.colEnd,
    input.action,
  )
}

/** 初始隐藏样例也进入 Rust，不由 demo CSS 或 React 状态伪造。 */
export function importSheetVisibility(
  workbook: WasmWorkbook,
  index: number,
  input: RustWorkbookSheetInput,
): void {
  for (const [axis, indices] of [
    ['hide-rows', input.hiddenRows],
    ['hide-columns', input.hiddenColumns],
  ] as const) {
    for (const value of indices ?? []) {
      const row = axis === 'hide-rows' ? value : 0
      const col = axis === 'hide-columns' ? value : 0
      const range = { rowStart: row, rowEnd: row, colStart: col, colEnd: col }
      changeVisibility(workbook, index, { range, action: axis }, input)
    }
  }
}
