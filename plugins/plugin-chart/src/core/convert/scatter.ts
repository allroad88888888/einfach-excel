import { valueAxis } from './axis'
import type { ChartOption, ChartPoint, ConvertInput } from './types'

/** 散点：首列（名称列）是 X 数值，没有名称列时按序号；X 或 Y 不是数字的点不画。 */
export function scatterOption(input: ConvertInput): ChartOption {
  const { data } = input
  const xs = data.xValues ?? data.categories.map((_, index) => index + 1)
  const series = data.series.map((entry) => ({
    type: 'scatter',
    name: entry.name,
    symbolSize: 8,
    data: entry.values.flatMap((y, index): ChartPoint[] => {
      const x = xs[index]
      return x === null || x === undefined || y === null
        ? [] : [{ value: [x, y], label: entry.labels[index] ?? '' }]
    }),
  }))
  return {
    xAxis: valueAxis(input, true, false),
    yAxis: valueAxis(input, false),
    series,
  } as ChartOption
}
