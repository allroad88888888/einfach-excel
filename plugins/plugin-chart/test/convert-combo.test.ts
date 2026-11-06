import { describe, expect, test } from 'vitest'
import { LIGHT_CHART_THEME, toEChartsOption, type ChartOption } from '../src/core/convert'
import type { ChartData, ChartSeries } from '../src/core/series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec, type ComboSeriesOption } from '../src/core/spec'

type Loose = Record<string, unknown>

const spec = (over: Partial<ChartSpec> = {}): ChartSpec =>
  ({ ...DEFAULT_CHART_SPEC, type: 'combo', ...over })
const series = (name: string, values: (number | null)[]): ChartSeries => ({
  name, values, labels: values.map((value) => (value === null ? '' : String(value))),
})
const chart = (categories: string[], list: ChartSeries[]): ChartData =>
  ({ categories, xValues: null, series: list })
const build = (data: ChartData, over: Partial<ChartSpec> = {}): ChartOption =>
  toEChartsOption({ spec: spec(over), data, theme: LIGHT_CHART_THEME })
const list = (option: ChartOption) => option.series as unknown as Loose[]
const yAxes = (option: ChartOption) => option.yAxis as unknown as Loose[]
const at = (value: unknown) => value as Loose

const three = chart(['Q1', 'Q2'],
  [series('A', [1, 2]), series('B', [3, 4]), series('C', [5, 6])])

describe('combo default kinds and axes', () => {
  test('earlier series are columns on the primary axis, the last is a line on the secondary', () => {
    const option = build(three)
    expect(list(option).map((entry) => [entry.type, entry.yAxisIndex])).toEqual([
      ['bar', 0], ['bar', 0], ['line', 1],
    ])
    expect(list(option)[0]).toMatchObject({ name: 'A' })
  })

  test('a single series is a plain column on the primary axis with no secondary axis', () => {
    const option = build(chart(['Q1'], [series('A', [1])]))
    expect(list(option)[0]).toMatchObject({ type: 'bar', yAxisIndex: 0 })
    expect(Array.isArray(option.yAxis)).toBe(false)
  })

  test('two series: the second is the secondary line', () => {
    const option = build(chart(['Q1'], [series('A', [1]), series('B', [2])]))
    expect(list(option).map((entry) => [entry.type, entry.yAxisIndex])).toEqual([
      ['bar', 0], ['line', 1],
    ])
    expect(yAxes(option)).toHaveLength(2)
  })

  test('the secondary axis draws no grid lines and no name, even with gridlines on', () => {
    const option = build(three, { gridlines: true, yTitle: 'Sales' })
    expect(yAxes(option)[0]).toMatchObject({ name: 'Sales', splitLine: { show: true } })
    expect(yAxes(option)[1]).toMatchObject({ splitLine: { show: false } })
    expect(yAxes(option)[1]!.name).toBeUndefined()
  })

  test('yMin/yMax bound only the primary axis, the secondary axis stays automatic', () => {
    const option = build(three, { yMin: 0, yMax: 100 })
    expect(yAxes(option)[0]).toMatchObject({ min: 0, max: 100 })
    expect(yAxes(option)[1]).toMatchObject({ min: undefined, max: undefined })
  })

  test('combo ignores the stack setting, series carry no stack key', () => {
    const option = build(three, { stack: 'stacked' })
    expect(list(option).every((entry) => !('stack' in entry))).toBe(true)
  })
})

describe('combo per-series options', () => {
  test('an explicit kind changes the chart type but not the secondary default', () => {
    const data = chart(['Q1'], [series('A', [1]), series('B', [2])])
    const option = build(data, { combo: [{ kind: 'line' }] })
    expect(list(option).map((entry) => [entry.type, entry.yAxisIndex])).toEqual([
      ['line', 0], ['line', 1],
    ])
  })

  test('an explicit secondary flag moves a column onto the secondary axis', () => {
    const data = chart(['Q1'], [series('A', [1]), series('B', [2]), series('C', [3])])
    const combo: ComboSeriesOption[] = [{ secondary: true }, {}, { kind: 'column', secondary: false }]
    const option = build(data, { combo })
    expect(list(option).map((entry) => [entry.type, entry.yAxisIndex])).toEqual([
      ['bar', 1], ['bar', 0], ['bar', 0],
    ])
    expect(yAxes(option)).toHaveLength(2)
  })

  test('kind on the last series overrides the default line; secondary still defaults on', () => {
    const data = chart(['Q1'], [series('A', [1]), series('B', [2])])
    const option = build(data, { combo: [{}, { kind: 'column' }] })
    expect(list(option)[1]).toMatchObject({ type: 'bar', yAxisIndex: 1 })
  })

  test('connectNulls applies to the line series only, and only in connect mode', () => {
    const data = chart(['Q1', 'Q2'], [series('A', [1, null]), series('B', [2, null])])
    const connect = list(build(data, { emptyCells: 'connect' }))
    expect(connect[0]).not.toHaveProperty('connectNulls')
    expect(connect[1]).toMatchObject({ connectNulls: true, showSymbol: true })
    expect(list(build(data))[1]).toMatchObject({ connectNulls: false })
  })

  test('emptyCells zero replaces null values in every series', () => {
    const data = chart(['Q1', 'Q2'], [series('A', [null, 2]), series('B', [1, null])])
    const option = build(data, { emptyCells: 'zero' })
    const points = (entry: Loose) => (entry.data as { value: unknown }[]).map((p) => p.value)
    expect(points(list(option)[0]!)).toEqual([0, 2])
    expect(points(list(option)[1]!)).toEqual([1, 0])
  })
})

describe('combo category axis', () => {
  test('the category axis takes the cell text of the categories', () => {
    const option = build(chart(['Jan', 'Feb'], [series('A', [1, 2]), series('B', [3, 4])]))
    expect(at(option.xAxis)).toMatchObject({ type: 'category', data: ['Jan', 'Feb'] })
  })
})
