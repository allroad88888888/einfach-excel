import { describe, expect, test } from 'vitest'
import { CHART_PALETTE_COLORS } from '../src/core/convert'
import { errorRanges } from '../src/core/convert/error-bars'
import { quickLayoutPatch } from '../src/core/quick-layouts'
import { DEFAULT_CHART_SPEC, parseChartSpec } from '../src/core/spec'
import { DEFAULT_TRENDLINE } from '../src/core/spec-analysis'
import { at, build, chart, list, series, spec, tooltip } from './convert-p2-helpers'

const linear = { ...DEFAULT_TRENDLINE, kind: 'linear' as const }
const sales = chart(['Q1', 'Q2', 'Q3', 'Q4'], [series('A', [2, 4, 6, 8]), series('B', [5, 3, 4, 1])])

describe('trendlines', () => {
  test('a dashed line in the series colour is appended after the data series', () => {
    const option = build('column', sales, { trendlines: [null, linear] })
    const trend = list(option)[2]!
    expect(list(option)).toHaveLength(3)
    expect(trend).toMatchObject({ type: 'line', id: 'trend:1', name: 'Linear (B)',
      color: '#ed7d31', lineStyle: { type: 'dashed' } })
    // y = -1.1x + 6 at x = 1…4（类别序号从 1 开始，同 Excel）。
    expect((trend.data as { value: number }[]).map((p) => Number(p.value.toFixed(2))))
      .toEqual([4.9, 3.8, 2.7, 1.6])
  })

  test('equation and R² are shown as the line’s end label', () => {
    const option = build('line', sales,
      { trendlines: [{ ...linear, showEquation: true, showR2: true }] })
    expect(at(at(list(option)[2]).endLabel)).toMatchObject(
      { show: true, formatter: 'y = 2x\nR² = 1' })
  })

  test('scatter trendlines are sampled across the X range', () => {
    const data = { categories: ['1', '2', '4'], xValues: [1, 2, 4],
      series: [series('Y', [1, 4, 16])] }
    const option = build('scatter', data,
      { trendlines: [{ ...DEFAULT_TRENDLINE, kind: 'power' }] })
    const points = list(option)[1]!.data as { value: [number, number] }[]
    expect(points[0]!.value).toEqual([1, expect.closeTo(1)])
    expect(points[points.length - 1]!.value).toEqual([4, expect.closeTo(16)])
    expect(points.length).toBeGreaterThan(10)
  })

  test('a moving average names its period and leaves the first points empty', () => {
    const option = build('line', sales,
      { trendlines: [{ ...DEFAULT_TRENDLINE, kind: 'movingAverage', period: 3 }] })
    const trend = list(option)[2]!
    expect(trend.name).toBe('3 per. Mov. Avg. (A)')
    expect((trend.data as { value: number | null }[]).map((p) => p.value))
      .toEqual([null, null, 4, 6])
  })

  test('stacked charts and pies get no trendline', () => {
    expect(list(build('column', sales, { stack: 'stacked', trendlines: [linear] }))).toHaveLength(2)
    expect(list(build('pie', sales, { trendlines: [linear] }))).toHaveLength(1)
  })
})

describe('error bars', () => {
  const pts = [{ x: 1, y: 2, at: 0 }, { x: 2, y: 4, at: 1 }, { x: 3, y: 6, at: 2 }]

  test('amounts follow Excel’s definitions', () => {
    expect(errorRanges({ kind: 'fixed', amount: 1, direction: 'both' }, pts, false)[0])
      .toEqual([0, 1, 3])
    expect(errorRanges({ kind: 'percent', amount: 50, direction: 'plus' }, pts, false)[1])
      .toEqual([1, 4, 6])
    // 标准偏差画在平均值 4 处：样本标准差 2。
    expect(errorRanges({ kind: 'stdDev', amount: 1, direction: 'minus' }, pts, false)[2])
      .toEqual([2, 2, 4])
    const [, low, high] = errorRanges({ kind: 'stdErr', amount: 1, direction: 'both' },
      pts, true)[0]!
    expect(high - 2).toBeCloseTo(2 / Math.sqrt(3))
    expect(2 - low).toBeCloseTo(2 / Math.sqrt(3))
  })

  test('each series gets a silent custom series with the same name', () => {
    const option = build('column', sales,
      { errorBars: { kind: 'fixed', amount: 1, direction: 'both' } })
    const bars = list(option).slice(2)
    expect(bars.map((entry) => [entry.type, entry.name, entry.silent]))
      .toEqual([['custom', 'A', true], ['custom', 'B', true]])
    expect(bars[0]!.data).toEqual([[0, 1, 3], [1, 3, 5], [2, 5, 7], [3, 7, 9]])
  })

  test('horizontal bars put the value on X', () => {
    const option = build('bar', sales,
      { errorBars: { kind: 'fixed', amount: 1, direction: 'both' } })
    expect(list(option)[2]!.encode).toEqual({ x: [1, 2], y: 0 })
  })

  test('error bars stay out of the tooltip', () => {
    const option = build('line', sales,
      { errorBars: { kind: 'fixed', amount: 1, direction: 'both' } })
    const text = tooltip(option).formatter([
      { seriesName: 'A', name: 'Q1', data: { label: '2' }, seriesType: 'line' },
      { seriesName: 'A', name: 'Q1', data: [0, 1, 3], seriesType: 'custom' },
    ])
    expect(text).toBe('Q1<br/>A: 2')
  })
})

describe('palette and quick layout', () => {
  test('a palette replaces the theme colours, explicit colours still win', () => {
    const option = build('column', sales, { palette: 'green', colors: ['#123456'] })
    expect(option.color).toEqual(CHART_PALETTE_COLORS.green)
    expect(list(option)[0]!.color).toBe('#123456')
  })

  test('a layout fills placeholders and clears removed titles', () => {
    const words = { title: 'Chart title', axisTitle: 'Axis title' }
    expect(quickLayoutPatch('layout5', spec('column', { title: 'Sales' }), words)).toEqual({
      title: 'Sales', xTitle: 'Axis title', yTitle: 'Axis title', legend: 'right',
      dataLabels: false, gridlines: true })
    expect(quickLayoutPatch('layout4', spec('column', { title: 'Sales', xTitle: 'Q' }), words))
      .toMatchObject({ title: '', xTitle: '', legend: 'bottom', dataLabels: true })
  })
})

describe('payload parsing', () => {
  test('defaults: no trendlines, no error bars, office palette', () => {
    expect(parseChartSpec({})).toMatchObject(
      { trendlines: [], errorBars: null, palette: 'office' })
    expect(DEFAULT_CHART_SPEC.palette).toBe('office')
  })

  test('bad entries fall back without losing the chart', () => {
    const parsed = parseChartSpec({ trendlines: [{ kind: 'cubic' }, { kind: 'polynomial',
      order: 9, period: 1.5, showR2: 'yes' }], errorBars: { kind: 'percent', amount: -1,
      direction: 'up' }, palette: 'neon' })
    expect(parsed.trendlines).toEqual([null, { kind: 'polynomial', order: 2, period: 2,
      showEquation: false, showR2: false }])
    expect(parsed.errorBars).toEqual({ kind: 'percent', amount: 5, direction: 'both' })
    expect(parsed.palette).toBe('office')
  })
})
