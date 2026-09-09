import type { RustFillRangeRequest } from './commands'
import type { WasmWorkbook } from './wasm-types'
import { withHistory } from './history-io'
import type { CellRange } from '../shared'
import { minimumFillSamples } from '../auto-fill/series-options'

const nativeRange = (range: CellRange) => ({
  startRow: range.rowStart, endRow: range.rowEnd, startCol: range.colStart, endCol: range.colEnd,
})

/** 选区前 N 行／列作为源；数据、序列推断、样式覆盖及历史快照全部留在 Rust。 */
export function fillRange(
  workbook: WasmWorkbook, sheet: number, input: RustFillRangeRequest,
): CellRange {
  const { range, direction } = input
  const vertical = direction === 'down' || direction === 'up'
  const rows = range.rowEnd - range.rowStart + 1
  const cols = range.colEnd - range.colStart + 1
  // history_begin 会先建立快照，所以必须在它之前拒绝非法或过大范围。
  if (!Object.values(range).every((n) => Number.isSafeInteger(n) && n >= 0) ||
    rows < 1 || cols < 1 || range.rowEnd >= 1_048_576 || range.colEnd >= 16_384 ||
    rows * cols > 1_048_576 || !['down', 'right', 'up', 'left'].includes(direction))
    throw new Error('Select a valid fill range of at most 1,048,576 cells.')
  if ((vertical ? rows : cols) < 2)
    throw new Error('Include a source row or column and at least one destination.')
  const series = input.series
  if ((!input.sourceRange && (direction === 'up' || direction === 'left')) ||
    (input.sourceRange && series)) throw new Error('Explicit source is required for reverse drag fill.')
  const sourceCount = series?.sourceCount ?? 1
  if (series && (!Number.isSafeInteger(sourceCount) ||
    sourceCount < minimumFillSamples(series.kind) ||
    sourceCount >= (direction === 'down' ? rows : cols) || (direction === 'down' ? cols : rows) !== 1))
    throw new Error('Select one row or column, with enough source samples and at least one destination.')
  const custom = series?.kind === 'custom-list' ? series.customValues : undefined
  if (series?.kind === 'custom-list' && (!Array.isArray(custom) || custom.length < 2 ||
    custom.length > 512 || custom.some((value) => typeof value !== 'string') ||
    custom.join('').length > 16_384))
    throw new Error('Enter 2–512 custom list items, at most 16384 characters.')
  if (!workbook.apply_auto_fill || !workbook.history_begin || !workbook.history_finish ||
    !workbook.snapshot_viewport_sizes)
    throw new Error('Rust fill command is unavailable.')
  const source = input.sourceRange ?? (direction === 'down'
    ? { ...range, rowEnd: range.rowStart + sourceCount - 1 }
    : { ...range, colEnd: range.colStart + sourceCount - 1 })
  if (!Object.values(source).every((n) => Number.isSafeInteger(n) && n >= 0) ||
    source.rowStart > source.rowEnd || source.colStart > source.colEnd ||
    source.rowStart < range.rowStart || source.rowEnd > range.rowEnd ||
    source.colStart < range.colStart || source.colEnd > range.colEnd ||
    (vertical ? source.colStart !== range.colStart || source.colEnd !== range.colEnd
      : source.rowStart !== range.rowStart || source.rowEnd !== range.rowEnd) ||
    (direction === 'down' ? source.rowStart !== range.rowStart || source.rowEnd >= range.rowEnd
      : direction === 'up' ? source.rowEnd !== range.rowEnd || source.rowStart <= range.rowStart
        : direction === 'right' ? source.colStart !== range.colStart || source.colEnd >= range.colEnd
          : source.colEnd !== range.colEnd || source.colStart <= range.colStart))
    throw new Error('Source and destination must extend along one fill direction.')
  const destination = direction === 'down'
    ? { ...range, rowStart: source.rowEnd + 1 }
    : direction === 'up' ? { ...range, rowEnd: source.rowStart - 1 }
      : direction === 'right' ? { ...range, colStart: source.colEnd + 1 }
        : { ...range, colEnd: source.colStart - 1 }
  withHistory(workbook, sheet, destination, `Fill ${series ? `${series.kind} series` : direction}`, true, () =>
    workbook.apply_auto_fill!({
      sheet, sourceRange: nativeRange(source), targetRange: nativeRange(range), direction,
      series: series?.kind === 'number' ? 'integer-step' : series?.kind ?? 'copy',
      ...(series || input.auto ? { infer: true } : {}),
      ...(custom ? { list: { listName: 'custom-fill', values: custom, locale: 'en' } } : {}),
    }),
  )
  return destination
}
