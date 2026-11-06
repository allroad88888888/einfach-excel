import { describe, expect, test } from 'vitest'
import { LIGHT_CHART_THEME, toEChartsOption, type ChartOption } from '../src/core/convert'
import type { ChartData, ChartSeries } from '../src/core/series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec, type ChartType } from '../src/core/spec'

type Loose = Record<string, unknown>

const spec = (type: ChartType, over: Partial<ChartSpec> = {}): ChartSpec =>
  ({ ...DEFAULT_CHART_SPEC, type, ...over })
const series = (name: string, values: (number | null)[]): ChartSeries => ({
  name, values, labels: values.map((value) => (value === null ? '' : String(value))),
})
const chart = (categories: string[], list: ChartSeries[]): ChartData =>
  ({ categories, xValues: null, series: list })
const build = (type: ChartType, data: ChartData, over: Partial<ChartSpec> = {}): ChartOption =>
  toEChartsOption({ spec: spec(type, over), data, theme: LIGHT_CHART_THEME })
const list = (option: ChartOption) => option.series as unknown as Loose[]
const at = (value: unknown) => value as Loose
const values = (entry: Loose) =>
  (entry.data as { value: number | null }[]).map((point) => point.value)
const labels = (entry: Loose) =>
  (entry.data as { label: string }[]).map((point) => point.label)

describe('cartesian charts: column / bar / line / area', () => {
  test('column: category axis carries the cell text, one bar series per data column', () => {
    const option = build('column', chart(['Q1', 'Q2'], [series('A', [1, 2]), series('B', [3, null])]))
    expect(at(option.xAxis)).toMatchObject({ type: 'category', data: ['Q1', 'Q2'], boundaryGap: true })
    expect(at(option.yAxis)).toMatchObject({ type: 'value' })
    expect(list(option)).toHaveLength(2)
    expect(list(option)[0]).toMatchObject({ type: 'bar', name: 'A' })
    expect(values(list(option)[1]!)).toEqual([3, null])
    expect(labels(list(option)[0]!)).toEqual(['1', '2'])
  })

  test('bar: swaps the axes so categories run down the side and values run across', () => {
    const option = build('bar', chart(['A', 'B'], [series('S', [1, 2])]))
    expect(at(option.xAxis)).toMatchObject({ type: 'value' })
    expect(at(option.yAxis)).toMatchObject({ type: 'category', data: ['A', 'B'], inverse: true })
    expect(list(option)[0]).toMatchObject({ type: 'bar' })
  })

  test('line: draws line series with symbols up to 60 categories, none beyond', () => {
    const line = build('line', chart(['A', 'B'], [series('S', [1, 2])]))
    expect(list(line)[0]).toMatchObject({ type: 'line', showSymbol: true })
    expect(at(line.xAxis)).toMatchObject({ boundaryGap: false })
    const names = Array.from({ length: 61 }, (_, index) => `C${index}`)
    const many = build('line', chart(names, [series('S', names.map(() => 1))]))
    expect(list(many)[0]).toMatchObject({ showSymbol: false })
  })

  test('area: line series with a translucent fill, more opaque when stacked', () => {
    const plain = build('area', chart(['A'], [series('S', [1])]))
    expect(list(plain)[0]).toMatchObject({ type: 'line', areaStyle: { opacity: 0.35 } })
    const stacked = build('area', chart(['A'], [series('S', [1])]), { stack: 'stacked' })
    expect(list(stacked)[0]).toMatchObject({ areaStyle: { opacity: 0.85 }, stack: 'total' })
  })

  test('connectNulls is set only for line-like series in connect mode', () => {
    const data = chart(['A', 'B'], [series('S', [1, null])])
    expect(list(build('line', data, { emptyCells: 'connect' }))[0])
      .toMatchObject({ connectNulls: true })
    expect(list(build('line', data))[0]).toMatchObject({ connectNulls: false })
    expect(list(build('column', data, { emptyCells: 'connect' }))[0])
      .not.toHaveProperty('connectNulls')
  })
})

describe('cartesian stacking', () => {
  const data = chart(['X', 'Y'], [series('A', [1, 3]), series('B', [1, 1])])

  test('stacked puts every series on one stack; none leaves them unstacked', () => {
    expect(list(build('column', data, { stack: 'stacked' })).map((entry) => entry.stack))
      .toEqual(['total', 'total'])
    expect(list(build('column', data))[0]).not.toHaveProperty('stack')
  })

  test('percent normalises each category to 100 and keeps the raw labels', () => {
    const option = build('column', data, { stack: 'percent' })
    expect(values(list(option)[0]!)).toEqual([50, 75])
    expect(values(list(option)[1]!)).toEqual([50, 25])
    expect(labels(list(option)[0]!)).toEqual(['1', '3'])
  })

  test('percent treats negatives as 0, keeps null, and yields 0 for an all-zero category', () => {
    const negative = chart(['X', 'Y'], [series('A', [-1, null]), series('B', [1, 2])])
    const option = build('column', negative, { stack: 'percent' })
    expect(values(list(option)[0]!)).toEqual([0, null])
    expect(values(list(option)[1]!)).toEqual([100, 100])
    const zero = build('column', chart(['X'], [series('A', [0]), series('B', [0])]),
      { stack: 'percent' })
    expect(values(list(zero)[0]!)).toEqual([0])
  })

  test('percent pins the value axis to 0-100 with a percent suffix, ignoring yMin/yMax', () => {
    const option = build('column', data, { stack: 'percent', yMin: 10, yMax: 50 })
    expect(at(option.yAxis)).toMatchObject({ min: 0, max: 100 })
    expect(at(at(option.yAxis).axisLabel)).toMatchObject({ formatter: '{value}%' })
  })
})

describe('cartesian value axis bounds and gridlines', () => {
  const data = chart(['A'], [series('S', [5])])

  test('yMin and yMax become the value axis bounds, unset means automatic', () => {
    expect(at(build('column', data, { yMin: 0, yMax: 100 }).yAxis))
      .toMatchObject({ min: 0, max: 100 })
    expect(at(build('column', data).yAxis)).toMatchObject({ min: undefined, max: undefined })
  })

  test('gridlines toggle the value axis split lines in the theme colour', () => {
    const on = at(build('column', data).yAxis)
    expect(on).toMatchObject({ splitLine: { show: true, lineStyle: { color: '#e6e5ee' } } })
    expect(at(build('column', data, { gridlines: false }).yAxis))
      .toMatchObject({ splitLine: { show: false } })
  })

  test('category axis never draws split lines', () => {
    expect(at(build('column', data, { gridlines: true }).xAxis))
      .toMatchObject({ splitLine: { show: false } })
  })
})

describe('cartesian axis titles', () => {
  const data = chart(['A'], [series('S', [5])])

  test('column: xTitle names the category axis, yTitle the value axis', () => {
    const option = build('column', data, { xTitle: 'Quarter', yTitle: 'Sales' })
    expect(at(option.xAxis)).toMatchObject({ name: 'Quarter', nameLocation: 'middle' })
    expect(at(option.yAxis)).toMatchObject({ name: 'Sales', nameLocation: 'middle' })
  })

  test('bar: xTitle sits on the horizontal value axis, yTitle on the vertical category axis', () => {
    const option = build('bar', data, { xTitle: 'Quarter', yTitle: 'Sales' })
    expect(at(option.xAxis)).toMatchObject({ type: 'value', name: 'Quarter' })
    expect(at(option.yAxis)).toMatchObject({ type: 'category', name: 'Sales' })
  })

  test('empty titles add no axis name', () => {
    const option = build('column', data)
    expect(at(option.xAxis).name).toBeUndefined()
    expect(at(option.yAxis).name).toBeUndefined()
  })
})
