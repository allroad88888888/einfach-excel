import type { SpreadsheetPlugin } from '@einfach-excel/react-excel'
import { ChartSettingsPanel } from './ChartSettingsPanel'
import { ChartView } from './ChartView'
import { CHART_KIND } from './core'
import { InsertChartTools } from './InsertChartTools'
import { labels, messages } from './messages'

/** 图表插件：渲染用 ECharts（只在本包依赖、首张图表出现时才加载），描述与数据引用存 Rust。 */
export const chartPlugin: SpreadsheetPlugin = {
  id: 'chart',
  ribbon: [{ id: 'chart.insert', tab: 'Insert', Group: InsertChartTools }],
  drawings: [{ kind: CHART_KIND, label: labels.chart, Renderer: ChartView }],
  panels: [ChartSettingsPanel],
  messages,
}
