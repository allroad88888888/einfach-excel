import { hasAxes, hasLegend, ownsStyle } from '../spec'
import { escapeHtml } from './text'
import type { ChartOption, ChartPoint, OptionOperator } from './types'

const pointLabel = (data: unknown) => (data as ChartPoint | undefined)?.label ?? ''

/** 全局文字、配色与背景；背景透明，交给对象框的表面色。 */
export const applyTheme: OptionOperator = (option, { spec, theme }) => ({
  ...option,
  color: [...theme.palette],
  backgroundColor: 'transparent',
  textStyle: { color: theme.text, fontFamily: theme.fontFamily, fontSize: spec.fontSize ?? 12 },
  animation: false,
})

/** 用户指定的颜色：普通图按系列，饼图按扇区；未指定的位置沿用主题配色。 */
export const applyColors: OptionOperator = (option, { spec }) => {
  if (!spec.colors.some(Boolean) || ownsStyle(spec.type)) return option
  const series = (option.series as Record<string, unknown>[] | undefined) ?? []
  const pie = spec.type === 'pie' || spec.type === 'doughnut'
  const colored = series.map((entry, index) => {
    if (!pie) {
      const color = spec.colors[index]
      // 系列级 color 同时作用于柱、线、点与面积。
      return color ? { ...entry, color } : entry
    }
    const points = (entry.data as ChartPoint[] | undefined) ?? []
    return { ...entry, data: points.map((point, at) => {
      const color = spec.colors[point.slot ?? at]
      return color ? { ...point, itemStyle: { color } } : point
    }) }
  })
  return { ...option, series: colored as ChartOption['series'] }
}

export const applyTitle: OptionOperator = (option, { spec, theme }) => spec.title
  ? { ...option, title: { text: spec.title, left: 'center', top: 8,
    textStyle: { color: theme.text, fontSize: (spec.fontSize ?? 12) + 2, fontWeight: 600,
      fontFamily: theme.fontFamily } } }
  : option

/** 图例位置同 Excel 的五个选项；竖排在左右两侧。 */
export const applyLegend: OptionOperator = (option, { spec, theme }) => {
  if (spec.legend === 'none' || !hasLegend(spec.type)) return { ...option, legend: { show: false } }
  const vertical = spec.legend === 'left' || spec.legend === 'right'
  return {
    ...option,
    legend: {
      type: 'scroll',
      orient: vertical ? 'vertical' : 'horizontal',
      ...(vertical ? { [spec.legend]: 8, top: 'middle' } : { left: 'center',
        [spec.legend]: spec.legend === 'top' && spec.title ? 34 : 8 }),
      textStyle: { color: theme.text, fontFamily: theme.fontFamily, fontSize: spec.fontSize ?? 12 },
      pageTextStyle: { color: theme.muted },
    },
  }
}

/** 提示框显示单元格原文（保持单元格数字格式），不显示归一化后的百分比堆积值。 */
export const applyTooltip: OptionOperator = (option, { spec, theme }) => ({
  ...option,
  tooltip: {
    // 先放通用默认，再让转换器自带的提示框（trigger / formatter）覆盖。
    trigger: hasAxes(spec.type) && spec.type !== 'scatter' ? 'axis' : 'item',
    confine: true,
    backgroundColor: theme.background,
    borderColor: theme.axisLine,
    textStyle: { color: theme.text, fontFamily: theme.fontFamily, fontSize: 12 },
    formatter: (params: unknown) => {
      // 误差线是自定义系列，不进提示框。
      const list = ((Array.isArray(params) ? params : [params]) as {
        marker?: string; seriesName?: string; name?: string; data?: unknown; percent?: number
        seriesType?: string
      }[]).filter((item) => item.seriesType !== 'custom')
      const head = list[0]?.name && spec.type !== 'scatter'
        ? `${escapeHtml(list[0].name)}<br/>` : ''
      return head + list.map((item) => {
        const name = spec.type === 'pie' || spec.type === 'doughnut' ? item.name : item.seriesName
        const percent = item.percent !== undefined ? ` (${item.percent}%)` : ''
        const value = escapeHtml(pointLabel(item.data))
        return `${item.marker ?? ''}${escapeHtml(name ?? '')}: ${value}${percent}`
      }).join('<br/>')
    },
    ...(option.tooltip as object | undefined),
  },
})

/** 数据标签用单元格原文；饼图标签放外侧并带百分比。 */
export const applyDataLabels: OptionOperator = (option, { spec, theme }) => {
  if (ownsStyle(spec.type)) return option
  const series = (option.series as Record<string, unknown>[] | undefined) ?? []
  const pie = spec.type === 'pie' || spec.type === 'doughnut'
  const label = pie
    ? { show: true, color: theme.text, formatter: (p: { name?: string; percent?: number }) =>
      // 有图例时名称已在图例里，数据标签只给百分比，避免外侧标签挤压截断。
      !spec.dataLabels ? p.name ?? ''
        : spec.legend === 'none' ? `${p.name ?? ''}: ${p.percent ?? 0}%` : `${p.percent ?? 0}%` }
    : { show: spec.dataLabels, color: theme.text, fontSize: (spec.fontSize ?? 12) - 1,
      formatter: (p: { data?: unknown }) => pointLabel(p.data) }
  return { ...option,
    series: series.map((entry) => ({ ...entry, label })) as ChartOption['series'] }
}

/** 绘图区让出标题与图例的位置，轴标签算在绘图区内。 */
export const applyGrid: OptionOperator = (option, { spec }) => {
  if (!hasAxes(spec.type)) return option
  const legend = spec.legend
  return {
    ...option,
    grid: {
      // ECharts 6 中等价于旧的 containLabel：轴标签算在绘图区边距内。
      outerBoundsMode: 'same',
      outerBoundsContain: 'axisLabel',
      top: (spec.title ? 40 : 16) + (legend === 'top' ? 28 : 0),
      bottom: 12 + (legend === 'bottom' ? 28 : 0) + (spec.xTitle ? 22 : 0),
      left: 12 + (legend === 'left' ? 96 : 0) + (spec.yTitle ? 22 : 0),
      right: 16 + (legend === 'right' ? 96 : 0),
    },
  }
}

