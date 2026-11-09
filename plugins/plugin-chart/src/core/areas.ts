import type { DrawingRange } from '@einfach-excel/spreadsheet-ui-core'
import { rangeCellCount } from './range-text'
import type { ChartGrid } from './series-layout'
import type { ChartHidden } from './visible-grid'

/** 一张图最多读 10,000 格（各区域合计），远低于显示读取上限，避免一次编辑触发大读。 */
export const MAX_CHART_CELLS = 10_000

/** 插入与改区域共用的校验；返回错误文本或 null。 */
export function validateChartAreas(areas: readonly DrawingRange[]): string | null {
  const cells = areas.reduce((sum, area) => sum + rangeCellCount(area), 0)
  if (!areas.length || cells < 2) return 'Select the chart data first, including headers.'
  if (cells > MAX_CHART_CELLS) return 'Choose at most 10,000 cells for a chart.'
  if (!areaLayout(areas)) return 'The chart areas must line up.'
  return null
}

/** 多区域合成一张数据表，同 Excel：行数相同则左右拼接，列数相同则上下拼接。 */
export function areaLayout(areas: readonly DrawingRange[]): 'single' | 'columns' | 'rows' | null {
  if (areas.length <= 1) return 'single'
  const height = (area: DrawingRange) => area.endRow - area.startRow
  const width = (area: DrawingRange) => area.endCol - area.startCol
  if (areas.every((area) => height(area) === height(areas[0]!))) return 'columns'
  if (areas.every((area) => width(area) === width(areas[0]!))) return 'rows'
  return null
}

/** 泛型：数据格与坐标格（数据点 → 单元格）走同一套拼接。 */
export function combineAreaGrids<T>(grids: readonly (readonly (readonly T[])[])[],
  layout: 'single' | 'columns' | 'rows'): readonly (readonly T[])[] {
  if (layout === 'single' || grids.length === 1) return grids[0] ?? []
  if (layout === 'rows') return grids.flat()
  return grids[0]!.map((_, row) => grids.flatMap((grid) => grid[row] ?? []))
}

/** 隐藏行列按拼接方向平移；另一方向沿用第一块区域（各块同高或同宽）。 */
export function combineAreaHidden(hidden: readonly ChartHidden[], grids: readonly ChartGrid[],
  layout: 'single' | 'columns' | 'rows'): ChartHidden {
  if (layout === 'single' || hidden.length <= 1) return hidden[0] ?? { rows: [], cols: [] }
  let offset = 0
  const shifted = hidden.map((entry, index) => {
    const start = offset
    offset += layout === 'columns'
      ? Math.max(0, ...grids[index]!.map((row) => row.length)) : grids[index]!.length
    return layout === 'columns'
      ? entry.cols.map((col) => col + start) : entry.rows.map((row) => row + start)
  }).flat()
  return layout === 'columns'
    ? { rows: hidden[0]!.rows, cols: shifted }
    : { rows: shifted, cols: hidden[0]!.cols }
}
