import type { RustFillRangeRequest } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { withHistory } from './history-io'
import type { CellRange } from '../shared'

const nativeRange = (range: CellRange) => ({
  startRow: range.rowStart, endRow: range.rowEnd, startCol: range.colStart, endCol: range.colEnd,
})

/** 首行／首列作为源；数据、公式位移、样式覆盖及历史快照全部留在 Rust。 */
export function fillRange(
  workbook: WasmWorkbook, sheet: number, input: RustFillRangeRequest,
): CellRange {
  const { range, direction } = input
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  // history_begin 会先建立快照，所以必须在它之前拒绝非法或过大范围。
  if (!Object.values(range).every((n) => Number.isSafeInteger(n) && n >= 0) ||
    rows < 1 || cols < 1 || range.rowEnd >= 1_048_576 || range.colEnd >= 16_384 ||
    rows * cols > 1_048_576 || !['down', 'right'].includes(direction))
    throw new Error('Select a valid fill range of at most 1,048,576 cells.')
  if ((direction === 'down' ? rows : cols) < 2)
    throw new Error('Include a source row or column and at least one destination.')
  if (!workbook.apply_auto_fill || !workbook.history_begin || !workbook.history_finish ||
    !workbook.snapshot_viewport_sizes)
    throw new Error('Rust fill command is unavailable.')
  const source = direction === 'down'
    ? { ...range, rowEnd: range.rowStart } : { ...range, colEnd: range.colStart }
  const destination = direction === 'down'
    ? { ...range, rowStart: range.rowStart + 1 } : { ...range, colStart: range.colStart + 1 }
  withHistory(workbook, sheet, destination, `Fill ${direction}`, true, () =>
    workbook.apply_auto_fill!({
      sheet, sourceRange: nativeRange(source), targetRange: nativeRange(range), direction, series: 'copy',
    }),
  )
  return destination
}
