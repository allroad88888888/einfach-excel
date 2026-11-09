import { supportsAnalysis } from '../spec'
import type { Trendline } from '../spec-analysis'
import { analysisPoints, seriesColor, seriesEntries, type AnalysisPoint } from './analysis-points'
import { fitTrend, movingAverage, type TrendFit } from './trend-fit'
import { formatCoefficient, rSquaredText, trendEquation } from './trend-equation'
import { DEFAULT_CHART_WORDS, type ChartOption, type ChartPoint, type ChartWords,
  type ConvertInput, type OptionOperator } from './types'

/** 散点图上非线性趋势线的采样点数；线性只要两端两个点。 */
const SCATTER_SAMPLES = 48

const point = (value: number | null): ChartPoint =>
  ({ value, label: value === null ? '' : formatCoefficient(value) })

/** 图例名同 Excel：「线性 (系列1)」「2 周期 移动平均 (系列1)」。 */
function trendName(trend: Trendline, series: string, words: ChartWords) {
  const kind = trend.kind === 'movingAverage'
    ? `${trend.period} ${words.movingAverage}` : words[trend.kind]
  return `${kind} (${series})`
}

/** 类别图：每个类别位置一个值，回归线覆盖整个类别范围。 */
function categoryValues(trend: Trendline, fit: TrendFit | null, points: AnalysisPoint[],
  count: number): (number | null)[] {
  if (trend.kind === 'movingAverage') {
    const values = Array<number | null>(count).fill(null)
    movingAverage(points.map(({ y }) => y), trend.period)
      .forEach((value, index) => { values[points[index]!.at] = value })
    return values
  }
  return Array.from({ length: count }, (_, at) => fit ? fit.predict(at + 1) : null)
}

/** 散点图：在 X 的取值范围内采样成 [x, y] 点列。 */
function scatterValues(trend: Trendline, fit: TrendFit | null,
  points: AnalysisPoint[]): ChartPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (trend.kind === 'movingAverage') {
    return movingAverage(sorted.map(({ y }) => y), trend.period).flatMap((y, index) =>
      y === null ? [] : [{ value: [sorted[index]!.x, y], label: formatCoefficient(y) }])
  }
  if (!fit || !sorted.length) return []
  const [min, max] = [sorted[0]!.x, sorted[sorted.length - 1]!.x]
  const steps = trend.kind === 'linear' ? 1 : SCATTER_SAMPLES
  return Array.from({ length: steps + 1 }, (_, step) => {
    const x = min + ((max - min) * step) / steps
    const y = fit.predict(x)
    return { value: [x, y] as const, label: formatCoefficient(y) }
  })
}

function label(trend: Trendline, fit: TrendFit | null, input: ConvertInput) {
  const lines = [
    trend.showEquation && fit ? trendEquation(trend.kind, fit.coefficients) : '',
    trend.showR2 && fit ? rSquaredText(fit.r2) : '',
  ].filter(Boolean)
  if (!lines.length) return {}
  // 标签贴在线尾的左上方：放右侧会超出绘图区被裁掉，或压住图例。
  return { endLabel: { show: true, formatter: lines.join('\n'), color: input.theme.text,
    align: 'right', verticalAlign: 'bottom', offset: [-4, -6],
    fontFamily: input.theme.fontFamily, fontSize: (input.spec.fontSize ?? 12) - 1,
    backgroundColor: input.theme.background, padding: [2, 4], borderRadius: 2 } }
}

/** 趋势线画成与系列同色的虚线折线系列，追加在数据系列之后，进图例。 */
export const applyTrendlines: OptionOperator = (option, input) => {
  const { spec, data } = input
  if (!spec.trendlines.some(Boolean) || !supportsAnalysis(spec)) return option
  const series = seriesEntries(option)
  const words = input.words ?? DEFAULT_CHART_WORDS
  const trends = data.series.flatMap((entry, index) => {
    const trend = spec.trendlines[index]
    if (!trend) return []
    const points = analysisPoints(input, index)
    const fit = fitTrend(trend, points)
    if (trend.kind === 'movingAverage' ? points.length < trend.period : !fit) return []
    const color = seriesColor(option, index)
    const values = spec.type === 'scatter' ? scatterValues(trend, fit, points)
      : categoryValues(trend, fit, points, data.categories.length).map(point)
    const axis = series[index]?.yAxisIndex
    return [{
      type: 'line', id: `trend:${index}`, name: trendName(trend, entry.name, words),
      data: values, color, showSymbol: false, symbol: 'none', z: 3,
      smooth: spec.type !== 'scatter' && trend.kind !== 'linear' && trend.kind !== 'movingAverage',
      lineStyle: { color, width: 1.5, type: 'dashed' }, label: { show: false },
      ...(axis === undefined ? {} : { yAxisIndex: axis }),
      ...label(trend, fit, input),
    }]
  })
  return trends.length
    ? { ...option, series: [...series, ...trends] as ChartOption['series'] } : option
}
