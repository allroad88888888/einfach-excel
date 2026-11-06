import { categoryAxis, valueAxis } from './axis'
import { slotColor } from './colors'
import { escapeHtml, formatNumber } from './text'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/** 类别名是「合计」一类的词时，这一根是汇总柱：从 0 画到单元格数值，并重置累计。 */
const TOTAL_NAME = /^\s*(total|subtotal|sum|合计|总计|小计|总额|汇总)\s*$/i

/** 颜色槽：0 增加、1 减少、2 汇总，默认取主题配色前三色（同 Office 的蓝、橙、灰）。 */
const INCREASE = 0
const DECREASE = 1
const TOTAL = 2

interface Step { readonly start: number; readonly end: number; readonly role: number }

function stepsOf(input: ConvertInput): Step[] {
  const first = input.data.series[0]
  let running = 0
  return input.data.categories.map((name, index) => {
    const delta = first?.values[index] ?? null
    const total = TOTAL_NAME.test(name)
    const start = total ? 0 : running
    const end = total ? delta ?? running : running + (delta ?? 0)
    running = end
    return { start, end, role: total ? TOTAL : end < start ? DECREASE : INCREASE }
  })
}

/**
 * 瀑布图：只画第一个系列，每个数值是增量，柱从上一累计值画到新的累计值，
 * 增加、减少、汇总三种颜色。用「透明垫底柱 + 正向段 + 负向段」堆积实现：
 * 柱完全在零线上方 / 下方时垫底柱托起可见段，跨过零线时正负两段各自从零线画起。
 */
export function waterfallOption(input: ConvertInput): ChartOption {
  const { spec, data, theme } = input
  const first = data.series[0]
  if (!first) return { series: [] }
  const steps = stepsOf(input)
  const base: (number | null)[] = []
  const positive: ChartPoint[] = []
  const negative: ChartPoint[] = []
  const color = (step: Step) => ({ color: slotColor(input, step.role) })
  steps.forEach((step, index) => {
    const low = Math.min(step.start, step.end)
    const high = Math.max(step.start, step.end)
    const text = first.labels[index] ?? ''
    // 数据标签只挂在较大的那一段上，跨零线时挂正向段。
    const onPositive = high > 0
    if (low >= 0) base.push(low)
    else base.push(high <= 0 ? high : null)
    const posValue = low >= 0 ? high - low : high > 0 ? high : null
    const negValue = high <= 0 ? low - high : low < 0 && high > 0 ? low : null
    positive.push({ value: posValue, label: onPositive ? text : '', itemStyle: color(step) } as ChartPoint)
    negative.push({ value: negValue, label: onPositive ? '' : text, itemStyle: color(step) } as ChartPoint)
  })
  const label = {
    show: spec.dataLabels, color: theme.text, fontSize: (spec.fontSize ?? 12) - 1,
    formatter: (p: { data?: unknown }) => (p.data as ChartPoint | undefined)?.label ?? '',
  }
  const bar = (name: string, points: unknown[], position: 'top' | 'bottom') => ({
    type: 'bar', name, stack: 'waterfall', data: points, barCategoryGap: '30%',
    label: { ...label, position },
  })
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const list = (Array.isArray(params) ? params : [params]) as { dataIndex?: number }[]
        const index = list[0]?.dataIndex ?? 0
        const step = steps[index]
        if (!step) return ''
        return `${escapeHtml(data.categories[index] ?? '')}<br/>` +
          `${escapeHtml(first.labels[index] ?? '')} → ${formatNumber(step.end)}`
      },
    },
    xAxis: { ...categoryAxis(input, true), boundaryGap: true },
    yAxis: valueAxis(input, false),
    series: [
      { type: 'bar', name: '', stack: 'waterfall', data: base, silent: true,
        itemStyle: { color: 'transparent' }, label: { show: false },
        tooltip: { show: false }, emphasis: { disabled: true }, barCategoryGap: '30%' },
      bar(first.name, positive, 'top'),
      bar(first.name, negative, 'bottom'),
    ],
  } as ChartOption
}
