import type { ChartPalette, ErrorBarDirection, ErrorBarKind, QuickLayout,
  TrendlineKind } from './core'

type Label = { id: string; message: string }

/** 图表设计（快速布局、更改颜色）、分析元素（趋势线、误差线）与 SVG 导出的界面文案。 */
export const designLabels = {
  quickLayout: { id: 'plugin.chart.quickLayout', message: 'Quick layout' },
  palette: { id: 'plugin.chart.palette', message: 'Change colors' },
  axisTitle: { id: 'plugin.chart.axisTitle', message: 'Axis title' },
  trendlines: { id: 'plugin.chart.trendlines', message: 'Trendlines' },
  trendline: { id: 'plugin.chart.trendline', message: 'Trendline' },
  order: { id: 'plugin.chart.trendline.order', message: 'Order' },
  period: { id: 'plugin.chart.trendline.period', message: 'Period' },
  showEquation: { id: 'plugin.chart.trendline.equation', message: 'Display equation' },
  showR2: { id: 'plugin.chart.trendline.r2', message: 'Display R-squared value' },
  errorBars: { id: 'plugin.chart.errorBars', message: 'Error bars' },
  errorAmount: { id: 'plugin.chart.errorBars.amount', message: 'Error amount' },
  errorDirection: { id: 'plugin.chart.errorBars.direction', message: 'Direction' },
  none: { id: 'plugin.chart.analysis.none', message: 'None' },
  downloadSvg: { id: 'plugin.chart.downloadSvg', message: 'Download SVG' },
  downloadedSvg: { id: 'plugin.chart.downloadedSvg', message: 'SVG downloaded.' },
}

export const trendlineLabels: Record<TrendlineKind, Label> = {
  linear: { id: 'plugin.chart.trendline.linear', message: 'Linear' },
  exponential: { id: 'plugin.chart.trendline.exponential', message: 'Exponential' },
  logarithmic: { id: 'plugin.chart.trendline.logarithmic', message: 'Logarithmic' },
  polynomial: { id: 'plugin.chart.trendline.polynomial', message: 'Polynomial' },
  power: { id: 'plugin.chart.trendline.power', message: 'Power' },
  movingAverage: { id: 'plugin.chart.trendline.movingAverage', message: 'Moving average' },
}

/** 趋势线图例名里的短词（同 Excel：Linear / Expon. / … / per. Mov. Avg.）。 */
export const trendWordLabels: Record<TrendlineKind, Label> = {
  linear: { id: 'plugin.chart.word.linear', message: 'Linear' },
  exponential: { id: 'plugin.chart.word.exponential', message: 'Expon.' },
  logarithmic: { id: 'plugin.chart.word.logarithmic', message: 'Log.' },
  polynomial: { id: 'plugin.chart.word.polynomial', message: 'Poly.' },
  power: { id: 'plugin.chart.word.power', message: 'Power' },
  movingAverage: { id: 'plugin.chart.word.movingAverage', message: 'per. Mov. Avg.' },
}

export const errorBarLabels: Record<ErrorBarKind, Label> = {
  fixed: { id: 'plugin.chart.errorBars.fixed', message: 'Fixed value' },
  percent: { id: 'plugin.chart.errorBars.percent', message: 'Percentage' },
  stdDev: { id: 'plugin.chart.errorBars.stdDev', message: 'Standard deviation' },
  stdErr: { id: 'plugin.chart.errorBars.stdErr', message: 'Standard error' },
}

export const errorDirectionLabels: Record<ErrorBarDirection, Label> = {
  both: { id: 'plugin.chart.errorBars.both', message: 'Both' },
  plus: { id: 'plugin.chart.errorBars.plus', message: 'Plus' },
  minus: { id: 'plugin.chart.errorBars.minus', message: 'Minus' },
}

export const paletteLabels: Record<ChartPalette, Label> = {
  office: { id: 'plugin.chart.palette.office', message: 'Office' },
  colorful: { id: 'plugin.chart.palette.colorful', message: 'Colorful' },
  warm: { id: 'plugin.chart.palette.warm', message: 'Warm' },
  cool: { id: 'plugin.chart.palette.cool', message: 'Cool' },
  blue: { id: 'plugin.chart.palette.blue', message: 'Monochromatic blue' },
  orange: { id: 'plugin.chart.palette.orange', message: 'Monochromatic orange' },
  green: { id: 'plugin.chart.palette.green', message: 'Monochromatic green' },
  gray: { id: 'plugin.chart.palette.gray', message: 'Monochromatic gray' },
}

export const layoutLabels: Record<QuickLayout, Label> = {
  layout1: { id: 'plugin.chart.layout1', message: 'Layout 1: title, legend on the right' },
  layout2: { id: 'plugin.chart.layout2', message: 'Layout 2: title, legend on top, data labels' },
  layout3: { id: 'plugin.chart.layout3', message: 'Layout 3: title, legend at the bottom' },
  layout4: { id: 'plugin.chart.layout4', message: 'Layout 4: legend at the bottom, data labels' },
  layout5: { id: 'plugin.chart.layout5', message: 'Layout 5: title, axis titles, legend' },
  layout6: { id: 'plugin.chart.layout6', message: 'Layout 6: title, axis titles, no legend' },
}

export const designZh: Record<string, string> = {
  [designLabels.quickLayout.id]: '快速布局', [designLabels.palette.id]: '更改颜色',
  [designLabels.axisTitle.id]: '坐标轴标题', [designLabels.trendlines.id]: '趋势线',
  [designLabels.trendline.id]: '趋势线', [designLabels.order.id]: '阶数',
  [designLabels.period.id]: '周期', [designLabels.showEquation.id]: '显示公式',
  [designLabels.showR2.id]: '显示 R 平方值', [designLabels.errorBars.id]: '误差线',
  [designLabels.errorAmount.id]: '误差量', [designLabels.errorDirection.id]: '方向',
  [designLabels.none.id]: '无', [designLabels.downloadSvg.id]: '下载 SVG',
  [designLabels.downloadedSvg.id]: 'SVG 已下载。',
  [trendlineLabels.linear.id]: '线性', [trendlineLabels.exponential.id]: '指数',
  [trendlineLabels.logarithmic.id]: '对数', [trendlineLabels.polynomial.id]: '多项式',
  [trendlineLabels.power.id]: '乘幂', [trendlineLabels.movingAverage.id]: '移动平均',
  [trendWordLabels.linear.id]: '线性', [trendWordLabels.exponential.id]: '指数',
  [trendWordLabels.logarithmic.id]: '对数', [trendWordLabels.polynomial.id]: '多项式',
  [trendWordLabels.power.id]: '乘幂', [trendWordLabels.movingAverage.id]: '周期 移动平均',
  [errorBarLabels.fixed.id]: '固定值', [errorBarLabels.percent.id]: '百分比',
  [errorBarLabels.stdDev.id]: '标准偏差', [errorBarLabels.stdErr.id]: '标准误差',
  [errorDirectionLabels.both.id]: '正负偏差', [errorDirectionLabels.plus.id]: '正偏差',
  [errorDirectionLabels.minus.id]: '负偏差',
  [paletteLabels.office.id]: 'Office 默认', [paletteLabels.colorful.id]: '彩色',
  [paletteLabels.warm.id]: '暖色', [paletteLabels.cool.id]: '冷色',
  [paletteLabels.blue.id]: '单色 · 蓝', [paletteLabels.orange.id]: '单色 · 橙',
  [paletteLabels.green.id]: '单色 · 绿', [paletteLabels.gray.id]: '单色 · 灰',
  [layoutLabels.layout1.id]: '布局 1：标题，图例在右',
  [layoutLabels.layout2.id]: '布局 2：标题，图例在上，数据标签',
  [layoutLabels.layout3.id]: '布局 3：标题，图例在下',
  [layoutLabels.layout4.id]: '布局 4：图例在下，数据标签',
  [layoutLabels.layout5.id]: '布局 5：标题，坐标轴标题，图例',
  [layoutLabels.layout6.id]: '布局 6：标题，坐标轴标题，无图例',
}

export const designMessageGroups = [designLabels, trendlineLabels, trendWordLabels,
  errorBarLabels, errorDirectionLabels, paletteLabels, layoutLabels]
