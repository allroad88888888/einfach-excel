import { layoutChartData, type ChartGrid } from './series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec, type ChartType } from './spec'

type Layout = Pick<ChartSpec, 'seriesIn' | 'headerRow' | 'headerCol'>

/**
 * 按数据形状推荐类型（近似 Excel「推荐的图表」）：
 * - 单系列、2–8 个类别且全为正 → 饼图
 * - 没有文字类别、恰好两列数字 → 散点（首列作 X）
 * - 类别超过 12 个 → 折线（趋势）
 * - 其余 → 簇状柱形
 */
export function recommendChart(grid: ChartGrid, layout: Layout):
  { readonly type: ChartType; readonly layout: Layout } {
  const data = layoutChartData(grid, { ...DEFAULT_CHART_SPEC, ...layout }, () => '')
  const values = data.series[0]?.values ?? []
  if (data.series.length === 1 && values.length >= 2 && values.length <= 8 &&
    values.every((value) => value !== null && value > 0))
    return { type: 'pie', layout }
  const columns = Math.max(0, ...grid.map((row) => row.length))
  const numericFirst = grid.slice(layout.headerRow ? 1 : 0)
    .every((row) => row[0]?.kind === 'number' || row[0]?.kind === 'blank')
  if (!layout.headerCol && columns === 2 && layout.seriesIn === 'columns' && numericFirst)
    return { type: 'scatter', layout: { ...layout, headerCol: true } }
  if (data.categories.length > 12) return { type: 'line', layout }
  return { type: 'column', layout }
}
