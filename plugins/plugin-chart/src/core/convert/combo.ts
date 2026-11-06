import { comboSeriesKind } from '../spec'
import { categoryAxis, valueAxis } from './axis'
import { emptyCellValues } from './empty-cells'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/**
 * 组合图：每个系列各选柱或线，可放到右侧次坐标轴；同 Excel 默认
 * 「簇状柱形图 + 次坐标轴上的折线图」（最后一个系列是线、在次轴）。不堆积。
 */
export function comboOption(input: ConvertInput): ChartOption {
  const { spec, data } = input
  const kinds = data.series.map((_, index) => comboSeriesKind(spec, index, data.series.length))
  const secondary = kinds.some((kind) => kind.secondary)
  const values = emptyCellValues(spec, data.series.map((entry) => entry.values))
  const series = data.series.map((entry, index) => ({
    type: kinds[index]!.kind === 'line' ? 'line' : 'bar',
    name: entry.name,
    yAxisIndex: kinds[index]!.secondary ? 1 : 0,
    ...(kinds[index]!.kind === 'line'
      ? { showSymbol: data.categories.length <= 60, connectNulls: spec.emptyCells === 'connect' }
      : {}),
    data: values[index]!.map((value, point): ChartPoint =>
      ({ value, label: entry.labels[point] ?? '' })),
  }))
  const primary = valueAxis(input, false)
  return {
    xAxis: categoryAxis(input, true),
    // 次轴不画网格线、不套用值轴上下限，避免两套刻度的横线互相干扰。
    yAxis: secondary
      ? [primary,
        { ...valueAxis(input, false, false), name: undefined, splitLine: { show: false } }]
      : primary,
    series,
  } as ChartOption
}
