import type { Messages } from '@lingui/core'
import type { ChartType, EmptyCellMode, LegendPosition, StackMode } from './core'

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
  copyImage: { id: 'plugin.chart.copyImage', message: 'Copy image' },
  fontSize: { id: 'plugin.chart.fontSize', message: 'Font size' },
  colors: { id: 'plugin.chart.colors', message: 'Colors' },
  resetColors: { id: 'plugin.chart.resetColors', message: 'Reset colors' },
  comboSeries: { id: 'plugin.chart.comboSeries', message: 'Series type' },
  secondaryAxis: { id: 'plugin.chart.secondaryAxis', message: 'Secondary axis' },
  recommended: { id: 'plugin.chart.recommended', message: 'Recommended chart' },
  emptyCells: { id: 'plugin.chart.emptyCells', message: 'Empty cells' },
  showHidden: { id: 'plugin.chart.showHidden', message: 'Show data in hidden rows and columns' },
  downloadPng: { id: 'plugin.chart.downloadPng', message: 'Download PNG' },
  copied: { id: 'plugin.chart.copied', message: 'Chart image copied.' },
  downloaded: { id: 'plugin.chart.downloaded', message: 'PNG downloaded.' },
  more: { id: 'plugin.chart.more', message: 'More charts' },
  increase: { id: 'plugin.chart.increase', message: 'Increase' },
  decrease: { id: 'plugin.chart.decrease', message: 'Decrease' },
  total: { id: 'plugin.chart.total', message: 'Total' },
}

/** 转换器在提示框里自己造出的统计词；经 ConvertInput.words 传入纯函数。 */
export const wordLabels = {
  max: { id: 'plugin.chart.word.max', message: 'Max' },
  q3: { id: 'plugin.chart.word.q3', message: 'Q3' },
  median: { id: 'plugin.chart.word.median', message: 'Median' },
  q1: { id: 'plugin.chart.word.q1', message: 'Q1' },
  min: { id: 'plugin.chart.word.min', message: 'Min' },
  mean: { id: 'plugin.chart.word.mean', message: 'Mean' },
  outlier: { id: 'plugin.chart.word.outlier', message: 'Outlier' },
  count: { id: 'plugin.chart.word.count', message: 'Count' },
}

export const typeLabels: Record<ChartType, { id: string; message: string }> = {
  column: { id: 'plugin.chart.type.column', message: 'Column' },
  bar: { id: 'plugin.chart.type.bar', message: 'Bar' },
  line: { id: 'plugin.chart.type.line', message: 'Line' },
  area: { id: 'plugin.chart.type.area', message: 'Area' },
  combo: { id: 'plugin.chart.type.combo', message: 'Combo' },
  pie: { id: 'plugin.chart.type.pie', message: 'Pie' },
  doughnut: { id: 'plugin.chart.type.doughnut', message: 'Doughnut' },
  scatter: { id: 'plugin.chart.type.scatter', message: 'Scatter' },
  radar: { id: 'plugin.chart.type.radar', message: 'Radar' },
  funnel: { id: 'plugin.chart.type.funnel', message: 'Funnel' },
  waterfall: { id: 'plugin.chart.type.waterfall', message: 'Waterfall' },
  histogram: { id: 'plugin.chart.type.histogram', message: 'Histogram' },
  boxplot: { id: 'plugin.chart.type.boxplot', message: 'Box and whisker' },
  stock: { id: 'plugin.chart.type.stock', message: 'Stock (open-high-low-close)' },
  treemap: { id: 'plugin.chart.type.treemap', message: 'Treemap' },
  sunburst: { id: 'plugin.chart.type.sunburst', message: 'Sunburst' },
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

export const emptyCellLabels: Record<EmptyCellMode, { id: string; message: string }> = {
  gap: { id: 'plugin.chart.empty.gap', message: 'Gaps' },
  zero: { id: 'plugin.chart.empty.zero', message: 'Zero' },
  connect: { id: 'plugin.chart.empty.connect', message: 'Connect with line' },
}

const errors: Record<string, string> = {
  'Choose one continuous range.': '请选择一个连续区域。',
  'The chart areas must line up.': '多个数据区域需同高（左右拼接）或同宽（上下拼接）。',
  'Select the chart data first, including headers.': '请先选中图表数据（含标题行/列）。',
  'Choose at most 10,000 cells for a chart.': '图表数据最多 10,000 个单元格。',
  'Enter a range such as B2:D10.': '请输入区域，例如 B2:D10。',
  'The chart data range was deleted.': '图表的数据区域已被删除。',
  'The chart data worksheet was deleted.': '图表数据所在的工作表已被删除。',
  'The object data worksheet does not exist.': '图表数据所在的工作表不存在。',
  'The workbook is not ready.': '工作簿尚未准备好。',
  'Choose a range inside the worksheet.': '请选择工作表内的区域。',
  'Rust returned an incomplete display range.': '读取的区域不完整，请重试。',
  'Image clipboard is unavailable. Download the PNG instead.': '当前环境不支持图片剪贴板，请下载 PNG。',
  'A stock chart needs exactly four number series: open, high, low, close.':
    '股价图需要恰好四个数值系列，依次为开盘、最高、最低、收盘。',
  'A treemap or sunburst needs category columns followed by a number column.':
    '树状图和旭日图需要若干层级类别列，最后一列为数值。',
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
  [labels.copyImage.id]: '复制图片', [labels.downloadPng.id]: '下载 PNG',
  [labels.fontSize.id]: '字号', [labels.colors.id]: '颜色', [labels.resetColors.id]: '恢复默认配色',
  [labels.comboSeries.id]: '系列类型', [labels.secondaryAxis.id]: '次坐标轴',
  [labels.recommended.id]: '推荐的图表',
  [labels.emptyCells.id]: '空单元格', [labels.showHidden.id]: '显示隐藏行列中的数据',
  [labels.copied.id]: '图表图片已复制。', [labels.downloaded.id]: 'PNG 已下载。',
  [typeLabels.column.id]: '柱形图', [typeLabels.bar.id]: '条形图', [typeLabels.line.id]: '折线图',
  [typeLabels.area.id]: '面积图', [typeLabels.combo.id]: '组合图', [typeLabels.pie.id]: '饼图', [typeLabels.doughnut.id]: '圆环图',
  [typeLabels.scatter.id]: '散点图',
  [typeLabels.radar.id]: '雷达图', [typeLabels.funnel.id]: '漏斗图',
  [typeLabels.waterfall.id]: '瀑布图', [typeLabels.histogram.id]: '直方图',
  [typeLabels.boxplot.id]: '箱线图', [typeLabels.stock.id]: '股价图（开盘-最高-最低-收盘）',
  [typeLabels.treemap.id]: '树状图', [typeLabels.sunburst.id]: '旭日图',
  [labels.more.id]: '更多图表', [labels.increase.id]: '增加', [labels.decrease.id]: '减少',
  [labels.total.id]: '汇总',
  [wordLabels.max.id]: '最大值', [wordLabels.q3.id]: '上四分位', [wordLabels.median.id]: '中位数',
  [wordLabels.q1.id]: '下四分位', [wordLabels.min.id]: '最小值', [wordLabels.mean.id]: '平均值',
  [wordLabels.outlier.id]: '离群点', [wordLabels.count.id]: '个数',
  [legendLabels.right.id]: '右侧', [legendLabels.bottom.id]: '底部', [legendLabels.top.id]: '顶部',
  [legendLabels.left.id]: '左侧', [legendLabels.none.id]: '无',
  [emptyCellLabels.gap.id]: '空距', [emptyCellLabels.zero.id]: '零值',
  [emptyCellLabels.connect.id]: '用直线连接数据点',
  [stackLabels.none.id]: '无', [stackLabels.stacked.id]: '堆积', [stackLabels.percent.id]: '百分比堆积',
}

const all = [labels, wordLabels, typeLabels, legendLabels, stackLabels, emptyCellLabels]
  .flatMap((group) => Object.values(group))
export const messages: Partial<Record<'en' | 'zh', Messages>> = {
  en: { ...Object.fromEntries(Object.keys(errors).map((key) => [key, key])),
    ...Object.fromEntries(all.map(({ id, message }) => [id, message])) },
  zh: { ...errors, ...zh },
}
