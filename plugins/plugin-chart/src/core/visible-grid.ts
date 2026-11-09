import type { DrawingRange, VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import type { ChartSpec } from './spec'

/** 数据区域内被隐藏的行列（相对区域左上角）：手动隐藏、筛选隐藏与分级折叠都算。 */
export interface ChartHidden {
  readonly rows: readonly number[]
  readonly cols: readonly number[]
}

export function chartHiddenFromSnapshot(snapshot: VisibleProjectionResult,
  range: DrawingRange): ChartHidden {
  const visibility = snapshot.visibility
  const within = (indices: readonly number[] | undefined, start: number, end: number) =>
    (indices ?? []).filter((index) => index >= start && index <= end).map((index) => index - start)
  const rows = new Set([
    ...within(visibility?.manualRows, range.startRow, range.endRow),
    ...within(visibility?.filterRows, range.startRow, range.endRow),
    ...within(visibility?.outlineRows, range.startRow, range.endRow),
  ])
  const cols = new Set([
    ...within(visibility?.manualColumns, range.startCol, range.endCol),
    ...within(visibility?.outlineColumns, range.startCol, range.endCol),
  ])
  return { rows: [...rows].sort((a, b) => a - b), cols: [...cols].sort((a, b) => a - b) }
}

/**
 * 同 Excel 默认：隐藏的数据行列不绘制；名称行 / 类别列即使隐藏也保留，
 * 否则系列名与类别会错位。「显示隐藏数据」打开时原样返回。
 */
export function visibleChartGrid<T>(grid: readonly (readonly T[])[],
  hidden: ChartHidden | undefined,
  spec: Pick<ChartSpec, 'showHidden' | 'headerRow' | 'headerCol'>): readonly (readonly T[])[] {
  if (spec.showHidden || !hidden || (!hidden.rows.length && !hidden.cols.length)) return grid
  const rows = new Set(hidden.rows.filter((row) => !(spec.headerRow && row === 0)))
  const cols = new Set(hidden.cols.filter((col) => !(spec.headerCol && col === 0)))
  return grid.filter((_, row) => !rows.has(row))
    .map((cells) => cells.filter((_, col) => !cols.has(col)))
}
