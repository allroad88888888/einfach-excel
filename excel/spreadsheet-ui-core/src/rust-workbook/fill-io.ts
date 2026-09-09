import type { RustFillRangeRequest } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { withHistory } from './history-io'
import type { CellRange } from '../shared'

const nativeRange = (range: CellRange) => ({
  startRow: range.rowStart, endRow: range.rowEnd, startCol: range.colStart, endCol: range.colEnd,
})

/** 选区前 N 行／列作为源；数据、序列推断、样式覆盖及历史快照全部留在 Rust。 */
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
  const series = input.series
  const sourceCount = series?.sourceCount ?? 1
  if (series && (!['number', 'text-number', 'linear-trend'].includes(series.kind) ||
    !Number.isSafeInteger(sourceCount) || sourceCount < (series.kind === 'linear-trend' ? 3 : 2) ||
    sourceCount >= (direction === 'down' ? rows : cols) || (direction === 'down' ? cols : rows) !== 1))
    throw new Error('Select one row or column, with enough source samples and at least one destination.')
  if (!workbook.apply_auto_fill || !workbook.history_begin || !workbook.history_finish ||
    !workbook.snapshot_viewport_sizes)
    throw new Error('Rust fill command is unavailable.')
  const source = direction === 'down'
    ? { ...range, rowEnd: range.rowStart + sourceCount - 1 }
    : { ...range, colEnd: range.colStart + sourceCount - 1 }
  const destination = direction === 'down'
    ? { ...range, rowStart: range.rowStart + sourceCount }
    : { ...range, colStart: range.colStart + sourceCount }
  withHistory(workbook, sheet, destination, `Fill ${series ? `${series.kind} series` : direction}`, true, () =>
    workbook.apply_auto_fill!({
      sheet, sourceRange: nativeRange(source), targetRange: nativeRange(range), direction,
      series: series?.kind === 'number' ? 'integer-step' : series?.kind ?? 'copy',
      ...(series ? { infer: true } : {}),
    }),
  )
  return destination
}
