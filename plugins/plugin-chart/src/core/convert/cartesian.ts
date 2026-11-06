import { categoryAxis, valueAxis } from './axis'
import { emptyCellValues } from './empty-cells'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/** 百分比堆积：每个类别按列和归一到 100；空值与负值按 0 计入列和，不改变原始标签。 */
function percentValues(input: ConvertInput): (number | null)[][] {
  const { series, categories } = input.data
  const totals = categories.map((_, index) =>
    series.reduce((sum, entry) => sum + Math.max(0, entry.values[index] ?? 0), 0))
  return series.map((entry) => entry.values.map((value, index) =>
    value === null ? null : totals[index] ? (Math.max(0, value) / totals[index]!) * 100 : 0))
}

/** 柱形、条形、折线、面积共用类别轴；条形图交换两轴。 */
export function cartesianOption(input: ConvertInput): ChartOption {
  const { spec, data } = input
  const horizontalBars = spec.type === 'bar'
  const percent = spec.stack === 'percent'
  const stacked = spec.stack !== 'none'
  const values = emptyCellValues(spec, percent ? percentValues(input)
    : data.series.map((entry) => entry.values))
  const seriesType = spec.type === 'column' || spec.type === 'bar' ? 'bar' : 'line'
  const series = data.series.map((entry, index) => ({
    type: seriesType,
    name: entry.name,
    ...(stacked ? { stack: 'total' } : {}),
    ...(spec.type === 'area' ? { areaStyle: { opacity: stacked ? 0.85 : 0.35 } } : {}),
    ...(seriesType === 'line' ? { showSymbol: data.categories.length <= 60,
      connectNulls: spec.emptyCells === 'connect' } : {}),
    data: values[index]!.map((value, point): ChartPoint => ({
      value, label: entry.labels[point] ?? '',
    })),
  }))
  const category = categoryAxis(input, !horizontalBars)
  const value = valueAxis(input, horizontalBars)
  return {
    xAxis: horizontalBars ? value : category,
    yAxis: horizontalBars ? { ...category, inverse: true } : value,
    series,
  } as ChartOption
}
