import type { ChartOption, ConvertInput } from './types'

/** 一个可分析的数据点：x 是回归用的横坐标，at 是它在类别轴上的序号。 */
export interface AnalysisPoint {
  readonly x: number
  readonly y: number
  readonly at: number
}

/**
 * 第 index 个系列参与分析的点：类别图的 x 同 Excel 取 1、2、3…；散点图取 X 列数值。
 * 空值（以及散点里 X 不是数字的点）跳过。
 */
export function analysisPoints({ spec, data }: ConvertInput, index: number): AnalysisPoint[] {
  const values = data.series[index]?.values ?? []
  const scatter = spec.type === 'scatter'
  const xs = data.xValues
  return values.flatMap((y, at): AnalysisPoint[] => {
    const x = scatter && xs ? xs[at] : at + 1
    return y === null || x === null || x === undefined ? [] : [{ x, y, at }]
  })
}

type SeriesEntry = Record<string, unknown>

/** 转换后的系列列表（前 data.series.length 个是数据系列，后面可能追加分析系列）。 */
export function seriesEntries(option: ChartOption): SeriesEntry[] {
  return (option.series as SeriesEntry[] | undefined) ?? []
}

/** 数据系列的实际颜色：用户覆盖色（applyColors 写在系列上）或主题配色循环。 */
export function seriesColor(option: ChartOption, index: number): string {
  const own = seriesEntries(option)[index]?.color
  if (typeof own === 'string') return own
  const palette = (option.color as string[] | undefined) ?? []
  return palette[index % Math.max(1, palette.length)] ?? '#4472c4'
}
