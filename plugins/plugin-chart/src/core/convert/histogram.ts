import { categoryAxis, valueAxis } from './axis'
import { slotColor } from './colors'
import { escapeHtml, formatNumber } from './text'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

const MAX_BINS = 100

export interface Bin { readonly from: number; readonly to: number; count: number }

/**
 * 自动分箱用 Scott 正态参考规则，同 Excel 的默认：箱宽 = 3.49 × 样本标准差 × n^(-1/3)，
 * 箱数 = ceil((最大 - 最小) / 箱宽)。全部相等（标准差为 0）时只有一箱。箱数上限 100。
 * 区间同 Excel：第一箱闭区间 [a, b]，其余为左开右闭 (a, b]，所以恰落在边界上的值归入左边的箱。
 */
export function scottBins(values: readonly number[]): Bin[] {
  const n = values.length
  if (n === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  const mean = values.reduce((sum, value) => sum + value, 0) / n
  const deviation = n > 1
    ? Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (n - 1)) : 0
  const width = 3.49 * deviation * n ** (-1 / 3)
  const count = width > 0 && max > min
    ? Math.min(MAX_BINS, Math.max(1, Math.ceil((max - min) / width))) : 1
  const step = count === 1 ? 0 : (max - min) / count
  const bins = Array.from({ length: count }, (_, index): Bin => ({
    from: min + step * index, to: index === count - 1 ? max : min + step * (index + 1), count: 0,
  }))
  for (const value of values) {
    // 减去极小量，避免 (v - min) / step 恰为整数时的浮点误差把边界值推进右边的箱。
    const at = step === 0 ? 0 : Math.ceil((value - min) / step - 1e-9) - 1
    bins[Math.min(count - 1, Math.max(0, at))]!.count += 1
  }
  return bins
}

/** 轴标签只留 4 位有效数字，三五个箱时才放得下；箱的真实边界不变。 */
const binLabel = (bin: Bin, index: number) =>
  `${index === 0 ? '[' : '('}${formatNumber(bin.from, 4)}, ${formatNumber(bin.to, 4)}]`

/** 直方图：对第一个系列的数值自动分箱，纵轴是每箱的个数；非数字格不计入。 */
export function histogramOption(input: ConvertInput): ChartOption {
  const { spec, data, theme, words } = input
  const first = data.series[0]
  const values = (first?.values ?? []).filter((value): value is number => value !== null)
  if (!first || values.length === 0) return { series: [] }
  const bins = scottBins(values)
  const names = bins.map(binLabel)
  return {
    tooltip: {
      trigger: 'axis',
      formatter: (params: unknown) => {
        const item = (Array.isArray(params) ? params : [params])[0] as { dataIndex?: number }
        const at = item?.dataIndex ?? 0
        return `${escapeHtml(names[at] ?? '')}<br/>${escapeHtml(words?.count ?? 'Count')}: ` +
          `${bins[at]?.count ?? 0}`
      },
    },
    xAxis: { ...categoryAxis({ ...input, data: { ...data, categories: names } }, true),
      boundaryGap: true },
    yAxis: { ...valueAxis(input, false), minInterval: 1 },
    series: [{
      type: 'bar',
      name: first.name,
      barCategoryGap: '4%',
      itemStyle: { color: slotColor(input, 0) },
      label: { show: spec.dataLabels, color: theme.text, position: 'top',
        fontSize: (spec.fontSize ?? 12) - 1,
        formatter: (p: { data?: unknown }) => (p.data as ChartPoint).label },
      data: bins.map((bin): ChartPoint => ({ value: bin.count, label: String(bin.count) })),
    }],
  } as ChartOption
}
