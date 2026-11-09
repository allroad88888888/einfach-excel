import { comboSeriesKind, supportsAnalysis } from '../spec'
import type { ErrorBars } from '../spec-analysis'
import { analysisPoints, seriesEntries, type AnalysisPoint } from './analysis-points'
import type { ChartOption, ConvertInput, OptionOperator } from './types'

/** ECharts 柱形默认的类别间距与系列间距；误差线按同一公式算出每根柱子的中心。 */
const CATEGORY_GAP = 0.2
const BAR_GAP = 0.3
const CAP = 4

function spread(points: readonly AnalysisPoint[]) {
  const mean = points.reduce((sum, { y }) => sum + y, 0) / points.length
  const variance = points.length < 2 ? 0
    : points.reduce((sum, { y }) => sum + (y - mean) ** 2, 0) / (points.length - 1)
  return { mean, sd: Math.sqrt(variance) }
}

/**
 * 每个点的 [位置, 下端, 上端]，同 Excel 的误差量定义：固定值、百分比按点值，
 * 标准偏差画在系列平均值处（±倍数 × 样本标准差），标准误差按点值 ± 标准差 / √n。
 */
export function errorRanges(bars: ErrorBars, points: readonly AnalysisPoint[],
  scatter: boolean): [number, number, number][] {
  if (!points.length) return []
  const { mean, sd } = spread(points)
  return points.map(({ x, y, at }) => {
    const center = bars.kind === 'stdDev' ? mean : y
    const amount = bars.kind === 'fixed' ? bars.amount
      : bars.kind === 'percent' ? (Math.abs(y) * bars.amount) / 100
        : bars.kind === 'stdDev' ? bars.amount * sd : sd / Math.sqrt(points.length)
    return [scatter ? x : at, center - (bars.direction === 'plus' ? 0 : amount),
      center + (bars.direction === 'minus' ? 0 : amount)]
  })
}

/** 哪些系列是柱子（用来求簇状柱的偏移）：柱形、条形全部是，组合图按逐系列设置。 */
function barSlots({ spec, data }: ConvertInput): (number | null)[] {
  const count = data.series.length
  const isBar = (index: number) => spec.type === 'column' || spec.type === 'bar' ||
    (spec.type === 'combo' && comboSeriesKind(spec, index, count).kind === 'column')
  let next = 0
  return data.series.map((_, index) => isBar(index) ? next++ : null)
}

interface Geometry {
  readonly horizontal: boolean
  readonly slot: number | null
  readonly bars: number
  readonly direction: ErrorBars['direction']
  readonly color: string
}

function renderer({ horizontal, slot, bars, direction, color }: Geometry) {
  return (_params: unknown, api: {
    value: (dim: number) => number
    coord: (point: number[]) => number[]
    size: (range: number[]) => number[]
  }) => {
    const [at, low, high] = [api.value(0), api.value(1), api.value(2)]
    const place = (value: number) => api.coord(horizontal ? [value, at] : [at, value])
    let offset = 0
    let cap = CAP
    if (slot !== null) {
      const band = horizontal ? api.size([0, 1])[1]! : api.size([1, 0])[0]!
      const width = (band * (1 - CATEGORY_GAP)) / (bars + (bars - 1) * BAR_GAP)
      offset = -(band * (1 - CATEGORY_GAP)) / 2 + slot * width * (1 + BAR_GAP) + width / 2
      cap = Math.min(CAP * 1.5, width / 4)
    }
    const shift = ([x, y]: number[]) => horizontal ? [x!, y! + offset] : [x! + offset, y!]
    const [from, to] = [shift(place(low)), shift(place(high))]
    const line = (x1: number, y1: number, x2: number, y2: number) =>
      ({ type: 'line', shape: { x1, y1, x2, y2 }, style: { stroke: color, lineWidth: 1 } })
    const capAt = ([x, y]: number[]) => horizontal
      ? line(x!, y! - cap, x!, y! + cap) : line(x! - cap, y!, x! + cap, y!)
    return { type: 'group', children: [
      line(from[0]!, from[1]!, to[0]!, to[1]!),
      ...(direction === 'plus' ? [] : [capAt(from)]),
      ...(direction === 'minus' ? [] : [capAt(to)]),
    ] }
  }
}

/**
 * 误差线画成自定义系列，与数据系列同名（图例开关时一起显隐），不进提示框、不响应鼠标。
 * 整张图一套设置，作用于每个数据系列。
 */
export const applyErrorBars: OptionOperator = (option, input) => {
  const { spec, data, theme } = input
  const bars = spec.errorBars
  if (!bars || !supportsAnalysis(spec)) return option
  const series = seriesEntries(option)
  const horizontal = spec.type === 'bar'
  const scatter = spec.type === 'scatter'
  const slots = barSlots(input)
  const barCount = slots.filter((slot) => slot !== null).length
  const errors = data.series.map((entry, index) => {
    const axis = series[index]?.yAxisIndex
    return {
      type: 'custom', id: `errorbar:${index}`, name: entry.name, silent: true, z: 4,
      tooltip: { show: false }, legendHoverLink: false,
      encode: horizontal ? { x: [1, 2], y: 0 } : { x: 0, y: [1, 2] },
      data: errorRanges(bars, analysisPoints(input, index), scatter),
      renderItem: renderer({ horizontal, slot: slots[index] ?? null, bars: barCount,
        direction: bars.direction, color: theme.text }),
      ...(axis === undefined ? {} : { yAxisIndex: axis }),
    }
  })
  return { ...option, series: [...series, ...errors] as ChartOption['series'] }
}
