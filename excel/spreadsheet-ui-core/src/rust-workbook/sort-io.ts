import type { RustSortCommands } from './sort-commands'
import type { WasmWorkbook } from './wasm-types'
import { withHistory } from './history-io'

/** 只把范围和排序键交给 Rust；值、行置换、样式及历史快照都不经过 JS。 */
export function sortRange(
  workbook: WasmWorkbook, sheet: number, input: RustSortCommands['range.sort']['payload'],
): number {
  const { range, keys, hasHeader } = input
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
  if (![range.rowStart, range.rowEnd, range.colStart, range.colEnd]
    .every((n) => Number.isSafeInteger(n) && n >= 0) ||
    rows < 2 + Number(hasHeader) || cols < 1 || range.rowEnd >= 1_048_576 ||
    range.colEnd >= 16_384 || rows * cols > 1_048_576 || typeof hasHeader !== 'boolean')
    throw new Error('Select at least two data rows, up to 1,048,576 cells.')
  if (!Array.isArray(keys) || keys.length < 1 || keys.length > 8 ||
    new Set(keys.map((key) => key.col)).size !== keys.length ||
    keys.some((key) => !Number.isSafeInteger(key.col) || key.col < range.colStart ||
      key.col > range.colEnd || !['asc', 'desc'].includes(key.direction)))
    throw new Error('Choose 1–8 different columns inside the selected range.')
  if (!workbook.sortRange || !workbook.history_begin || !workbook.history_finish ||
    !workbook.read_sparse_range || !workbook.snapshot_format_range)
    throw new Error('Rust sort command is unavailable.')
  const data = { ...range, rowStart: range.rowStart + Number(hasHeader) }
  return withHistory(workbook, sheet, data, 'Sort selection', true, () => {
    const result = workbook.sortRange!(sheet, {
      range: { startRow: data.rowStart, endRow: data.rowEnd,
        startCol: data.colStart, endCol: data.colEnd },
      keys: keys.map((key) => ({ ...key, caseSensitive: false })), excludedRows: [],
    })
    // 原生拒绝是 ok:false 返回值，不是异常；必须让历史分组取消。
    if (!result.ok) throw new Error(result.code === 'spill-in-range'
      ? 'The range contains an array spill. Remove the array before sorting.'
      : result.code === 'merge-in-range' ? 'Unmerge cells before sorting this range.'
        : result.message || `Sort rejected: ${result.code}`)
    return result.movedRows
  })
}
