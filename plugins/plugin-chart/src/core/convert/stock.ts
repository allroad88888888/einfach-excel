import { categoryAxis, valueAxis } from './axis'
import { slotColor } from './colors'
import { chartIssue } from './issues'
import { escapeHtml } from './text'
import type { ChartOption, ConvertInput } from './types'

/** 颜色槽：0 上涨（收盘高于开盘）、1 下跌；与主题配色无关，红绿含义固定。 */
export const STOCK_COLORS = ['#2e9e5b', '#d64545'] as const

/**
 * 股价图（开盘-最高-最低-收盘）：必须恰好 4 个数值系列，顺序依次是开盘、最高、最低、收盘，
 * 类别（通常是日期）在横轴。系列数不对时不画，由视图显示 chartIssue 的错误提示。
 * 任一价格缺失的那一天不画。
 */
export function stockOption(input: ConvertInput): ChartOption {
  const { data } = input
  if (chartIssue(input.spec, data)) return { series: [] }
  const [open, high, low, close] = data.series.map((series) => series.values)
  const up = slotColor(input, 0, STOCK_COLORS[0])
  const down = slotColor(input, 1, STOCK_COLORS[1])
  const days = data.categories.map((_, index) => {
    const o = open![index]
    const h = high![index]
    const l = low![index]
    const c = close![index]
    return o == null || h == null || l == null || c == null ? null : { o, h, l, c }
  })
  return {
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'cross' },
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as { dataIndex?: number }[]
        const index = list[0]?.dataIndex ?? 0
        const name = `${escapeHtml(data.categories[index] ?? '')}<br/>`
        return days[index] ? name + data.series.map((series) =>
          `${escapeHtml(series.name)}: ${escapeHtml(series.labels[index] ?? '')}`).join('<br/>')
          : name
      },
    },
    xAxis: { ...categoryAxis(input, true), boundaryGap: true },
    yAxis: { ...valueAxis(input, false), scale: true },
    series: [{
      type: 'candlestick',
      name: data.series[3]!.name,
      // ECharts 的蜡烛数据顺序是 [开, 收, 低, 高]。
      data: days.map((day) => day ? [day.o, day.c, day.l, day.h] : '-'),
      itemStyle: { color: up, color0: down, borderColor: up, borderColor0: down },
    }],
  } as ChartOption
}
