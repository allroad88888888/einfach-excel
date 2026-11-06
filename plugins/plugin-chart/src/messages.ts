import type { Messages } from '@lingui/core'
import type { ChartType, LegendPosition, StackMode } from './core'

export const labels = {
  chart: { id: 'plugin.chart.chart', message: 'Chart' },
  insert: { id: 'plugin.chart.insert', message: 'Insert chart' },
  settings: { id: 'plugin.chart.settings', message: 'Chart settings' },
  close: { id: 'plugin.chart.close', message: 'Close' },
  type: { id: 'plugin.chart.type', message: 'Chart type' },
  range: { id: 'plugin.chart.range', message: 'Data range' },
  applyRange: { id: 'plugin.chart.applyRange', message: 'Apply' },
  seriesIn: { id: 'plugin.chart.seriesIn', message: 'Series in' },
  columns: { id: 'plugin.chart.columns', message: 'Columns' },
  rows: { id: 'plugin.chart.rows', message: 'Rows' },
  headerRow: { id: 'plugin.chart.headerRow', message: 'First row is names' },
  headerCol: { id: 'plugin.chart.headerCol', message: 'First column is categories' },
  title: { id: 'plugin.chart.title', message: 'Chart title' },
  legend: { id: 'plugin.chart.legend', message: 'Legend' },
  stack: { id: 'plugin.chart.stack', message: 'Stacking' },
  dataLabels: { id: 'plugin.chart.dataLabels', message: 'Data labels' },
  gridlines: { id: 'plugin.chart.gridlines', message: 'Gridlines' },
  xTitle: { id: 'plugin.chart.xTitle', message: 'Horizontal axis title' },
  yTitle: { id: 'plugin.chart.yTitle', message: 'Vertical axis title' },
  yMin: { id: 'plugin.chart.yMin', message: 'Value axis minimum' },
  yMax: { id: 'plugin.chart.yMax', message: 'Value axis maximum' },
  auto: { id: 'plugin.chart.auto', message: 'Auto' },
  series: { id: 'plugin.chart.series', message: 'Series' },
  loading: { id: 'plugin.chart.loading', message: 'Loading chart…' },
  empty: { id: 'plugin.chart.empty', message: 'No numbers to plot in the data range.' },
}

export const typeLabels: Record<ChartType, { id: string; message: string }> = {
  column: { id: 'plugin.chart.type.column', message: 'Column' },
  bar: { id: 'plugin.chart.type.bar', message: 'Bar' },
  line: { id: 'plugin.chart.type.line', message: 'Line' },
  area: { id: 'plugin.chart.type.area', message: 'Area' },
  pie: { id: 'plugin.chart.type.pie', message: 'Pie' },
  doughnut: { id: 'plugin.chart.type.doughnut', message: 'Doughnut' },
  scatter: { id: 'plugin.chart.type.scatter', message: 'Scatter' },
}
export const legendLabels: Record<LegendPosition, { id: string; message: string }> = {
  right: { id: 'plugin.chart.legend.right', message: 'Right' },
  bottom: { id: 'plugin.chart.legend.bottom', message: 'Bottom' },
  top: { id: 'plugin.chart.legend.top', message: 'Top' },
  left: { id: 'plugin.chart.legend.left', message: 'Left' },
  none: { id: 'plugin.chart.legend.none', message: 'None' },
}
export const stackLabels: Record<StackMode, { id: string; message: string }> = {
  none: { id: 'plugin.chart.stack.none', message: 'None' },
  stacked: { id: 'plugin.chart.stack.stacked', message: 'Stacked' },
  percent: { id: 'plugin.chart.stack.percent', message: '100% stacked' },
}

const errors: Record<string, string> = {
  'Choose one continuous range.': '请选择一个连续区域。',
  'Select the chart data first, including headers.': '请先选中图表数据（含标题行/列）。',
  'Choose at most 10,000 cells for a chart.': '图表数据最多 10,000 个单元格。',
  'Enter a range such as B2:D10.': '请输入区域，例如 B2:D10。',
  'The chart data range was deleted.': '图表的数据区域已被删除。',
  'The workbook is not ready.': '工作簿尚未准备好。',
  'Choose a range inside the worksheet.': '请选择工作表内的区域。',
  'Rust returned an incomplete display range.': '读取的区域不完整，请重试。',
}

const zh: Record<string, string> = {
  [labels.chart.id]: '图表', [labels.insert.id]: '插入图表', [labels.settings.id]: '图表设置',
  [labels.close.id]: '关闭', [labels.type.id]: '图表类型', [labels.range.id]: '数据区域',
  [labels.applyRange.id]: '应用', [labels.seriesIn.id]: '系列产生在',
  [labels.columns.id]: '列', [labels.rows.id]: '行',
  [labels.headerRow.id]: '首行为名称', [labels.headerCol.id]: '首列为类别',
  [labels.title.id]: '图表标题', [labels.legend.id]: '图例', [labels.stack.id]: '堆积',
  [labels.dataLabels.id]: '数据标签', [labels.gridlines.id]: '网格线',
  [labels.xTitle.id]: '横坐标轴标题', [labels.yTitle.id]: '纵坐标轴标题',
  [labels.yMin.id]: '值轴最小值', [labels.yMax.id]: '值轴最大值', [labels.auto.id]: '自动',
  [labels.series.id]: '系列', [labels.loading.id]: '正在加载图表…',
  [labels.empty.id]: '数据区域中没有可绘制的数字。',
  [typeLabels.column.id]: '柱形图', [typeLabels.bar.id]: '条形图', [typeLabels.line.id]: '折线图',
  [typeLabels.area.id]: '面积图', [typeLabels.pie.id]: '饼图', [typeLabels.doughnut.id]: '圆环图',
  [typeLabels.scatter.id]: '散点图',
  [legendLabels.right.id]: '右侧', [legendLabels.bottom.id]: '底部', [legendLabels.top.id]: '顶部',
  [legendLabels.left.id]: '左侧', [legendLabels.none.id]: '无',
  [stackLabels.none.id]: '无', [stackLabels.stacked.id]: '堆积', [stackLabels.percent.id]: '百分比堆积',
}

const all = [labels, typeLabels, legendLabels, stackLabels].flatMap((group) => Object.values(group))
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: { ...Object.fromEntries(Object.keys(errors).map((key) => [key, key])),
    ...Object.fromEntries(all.map(({ id, message }) => [id, message])) },
  zh: { ...errors, ...zh },
}
