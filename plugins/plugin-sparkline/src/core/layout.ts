import type { DrawingRange } from '@einfach-excel/spreadsheet-ui-core'

export const MAX_SPARKLINE_POINTS = 1000
export const MAX_SPARKLINES_PER_GROUP = 1000

/** 一条迷你图：所在单元格与它读的那一行或一列数据。 */
export interface SparklineSlot {
  readonly row: number
  readonly col: number
  readonly data: DrawingRange
}

const height = (range: DrawingRange) => range.endRow - range.startRow + 1
const width = (range: DrawingRange) => range.endCol - range.startCol + 1

/**
 * 按 Excel 规则把数据区域切给位置区域里的每一格：位置是一列 n 格时数据按行切（需 n 行），
 * 一行 n 格时按列切（需 n 列）；对不上方向时再试另一方向。单格位置读整块一维数据。
 */
export function sparklineSlots(location: DrawingRange, data: DrawingRange):
  { readonly slots: SparklineSlot[] } | { readonly error: string } {
  if (height(location) > 1 && width(location) > 1)
    return { error: 'The location range must be a single row or column.' }
  const count = Math.max(height(location), width(location))
  if (count > MAX_SPARKLINES_PER_GROUP)
    return { error: 'A sparkline group can have at most 1000 sparklines.' }
  const cells = Array.from({ length: count }, (_, index) => height(location) > 1
    ? { row: location.startRow + index, col: location.startCol }
    : { row: location.startRow, col: location.startCol + index })
  const byRows = height(data) === count && (count > 1 || height(data) === 1)
  const byCols = width(data) === count && (count > 1 || width(data) === 1)
  const vertical = height(location) > 1
  const useRows = vertical ? byRows || !byCols : !byCols && byRows
  if (!(useRows ? byRows : byCols))
    return { error: 'The data range does not match the number of sparkline cells.' }
  const slots = cells.map((cell, index): SparklineSlot => ({ ...cell, data: useRows
    ? { ...data, startRow: data.startRow + index, endRow: data.startRow + index }
    : { ...data, startCol: data.startCol + index, endCol: data.startCol + index } }))
  if (slots.some((slot) => height(slot.data) * width(slot.data) > MAX_SPARKLINE_POINTS))
    return { error: 'A sparkline can show at most 1000 points.' }
  return { slots }
}
