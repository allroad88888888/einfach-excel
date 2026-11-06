import { describe, expect, test } from 'vitest'
import {
  chartTheme, LIGHT_CHART_THEME, toEChartsOption, type ChartOption, type ChartTheme,
} from '../src/core/convert'
import type { ChartData, ChartSeries } from '../src/core/series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec, type ChartType } from '../src/core/spec'

type Loose = Record<string, unknown>
type Formatter = (params: unknown) => string

const spec = (type: ChartType, over: Partial<ChartSpec> = {}): ChartSpec =>
  ({ ...DEFAULT_CHART_SPEC, type, ...over })
const series = (name: string, values: (number | null)[]): ChartSeries => ({
  name, values, labels: values.map((value) => (value === null ? '' : String(value))),
})
const chart = (categories: string[], list: ChartSeries[]): ChartData =>
  ({ categories, xValues: null, series: list })
const build = (type: ChartType, data: ChartData, over: Partial<ChartSpec> = {},
  theme: ChartTheme = LIGHT_CHART_THEME): ChartOption =>
  toEChartsOption({ spec: spec(type, over), data, theme })
const list = (option: ChartOption) => option.series as unknown as Loose[]
const at = (value: unknown) => value as Loose
const formatterOf = (holder: unknown) => at(holder).formatter as Formatter

const columns = chart(['Q1', 'Q2'], [series('A', [1200, null]), series('B', [3, 4])])
const pie = chart(['A', 'B'], [series('Share', [3, 5])])

describe('title', () => {
  test('a title is centred at the top with the text size plus two', () => {
    expect(at(build('column', columns, { title: 'Sales' }).title)).toMatchObject({
      text: 'Sales', left: 'center', top: 8,
      textStyle: { fontSize: 14, fontWeight: 600 },
    })
    expect(at(build('column', columns, { title: 'Sales', fontSize: 16 }).title).textStyle)
      .toMatchObject({ fontSize: 18 })
  })

  test('an empty title adds no title component', () => {
    expect(build('column', columns).title).toBeUndefined()
  })
})

describe('legend', () => {
  test('none hides the legend', () => {
    expect(build('column', columns, { legend: 'none' }).legend).toEqual({ show: false })
  })

  test('right and left are vertical, centred vertically on their side', () => {
    expect(at(build('column', columns, { legend: 'right' }).legend))
      .toMatchObject({ type: 'scroll', orient: 'vertical', right: 8, top: 'middle' })
    expect(at(build('column', columns, { legend: 'left' }).legend))
      .toMatchObject({ orient: 'vertical', left: 8, top: 'middle' })
  })

  test('bottom is horizontal and centred at the bottom', () => {
    expect(at(build('column', columns, { legend: 'bottom' }).legend))
      .toMatchObject({ orient: 'horizontal', left: 'center', bottom: 8 })
  })

  test('top sits lower under a title and close to the edge without one', () => {
    expect(at(build('column', columns, { legend: 'top' }).legend))
      .toMatchObject({ orient: 'horizontal', left: 'center', top: 8 })
    expect(at(build('column', columns, { legend: 'top', title: 'T' }).legend))
      .toMatchObject({ top: 34 })
  })

  test('legend text follows the font size and muted page text colour', () => {
    expect(at(build('column', columns, { fontSize: 20 }).legend).textStyle)
      .toMatchObject({ fontSize: 20, color: LIGHT_CHART_THEME.text })
    expect(at(build('column', columns).legend).pageTextStyle)
      .toEqual({ color: LIGHT_CHART_THEME.muted })
  })
})

describe('tooltip', () => {
  test('column shows an axis tooltip, pie and scatter show an item tooltip', () => {
    expect(at(build('column', columns).tooltip).trigger).toBe('axis')
    expect(at(build('line', columns).tooltip).trigger).toBe('axis')
    expect(at(build('pie', pie).tooltip).trigger).toBe('item')
    expect(at(build('scatter', chart(['a'], [series('Y', [1])])).tooltip).trigger).toBe('item')
  })

  test('the axis tooltip heads with the category and lists each series with its cell text', () => {
    const format = formatterOf(build('column', columns).tooltip)
    const params = [
      { marker: '*', seriesName: 'A', name: 'Q1', data: { label: '1,200' } },
      { marker: '#', seriesName: 'B', name: 'Q1', data: { label: '3' } },
    ]
    expect(format(params)).toBe('Q1<br/>*A: 1,200<br/>#B: 3')
  })

  test('tooltip text is HTML-escaped', () => {
    const format = formatterOf(build('column', columns).tooltip)
    expect(format([{ marker: '', seriesName: '<s>', name: '<b>&"', data: { label: "'x'" } }]))
      .toBe('&lt;b&gt;&amp;&quot;<br/>&lt;s&gt;: &#39;x&#39;')
  })

  test('scatter omits the head and pie reports the percentage', () => {
    const scatter = formatterOf(build('scatter', chart(['a'], [series('Y', [1])]), {}).tooltip)
    expect(scatter([{ name: 'a', seriesName: 'Y', data: { label: '5' } }])).toBe('Y: 5')
    const sector = formatterOf(build('pie', pie).tooltip)
    const text = sector({ name: 'A', percent: 25, data: { label: '3' } })
    expect(text).toContain('A: 3 (25%)')
  })
})

describe('data labels', () => {
  test('cartesian labels show the cell text, one point smaller than the chart font', () => {
    const label = at(list(build('column', columns, { dataLabels: true }))[0]!.label)
    expect(label).toMatchObject({ show: true, fontSize: 11 })
    const format = at(label).formatter as (point: unknown) => string
    expect(format({ data: { label: '1,200' } })).toBe('1,200')
    expect(at(list(build('column', columns))[0]!.label)).toMatchObject({ show: false })
    const bigger = at(list(build('column', columns, { dataLabels: true, fontSize: 16 }))[0]!.label)
    expect(bigger).toMatchObject({ fontSize: 15 })
  })

  test('pie labels: percentage only with a legend, name and percentage without one', () => {
    const label = (over: Partial<ChartSpec>) =>
      formatterOf(at(list(build('pie', pie, over))[0]!.label))
    const point = { name: 'A', percent: 25 }
    expect(label({ dataLabels: false })(point)).toBe('A')
    expect(label({ dataLabels: true })(point)).toBe('25%')
    expect(label({ dataLabels: true, legend: 'none' })(point)).toBe('A: 25%')
    expect(at(list(build('pie', pie))[0]!.label)).toMatchObject({ show: true })
  })
})

describe('colours', () => {
  test('a series colour override applies to that series only', () => {
    const option = build('column', columns, { colors: ['#ff0000', null] })
    expect(list(option)[0]).toMatchObject({ color: '#ff0000' })
    expect(list(option)[1]).not.toHaveProperty('color')
  })

  test('with no overrides the series are left untouched', () => {
    const option = build('column', columns, { colors: [null, null] })
    expect(list(option).every((entry) => !('color' in entry))).toBe(true)
  })

  test('pie colours map to sectors in category order', () => {
    const option = build('pie', pie, { colors: ['#111111', '#222222'] })
    expect((list(option)[0]!.data as { itemStyle?: { color: string } }[]).map((point) =>
      point.itemStyle?.color)).toEqual(['#111111', '#222222'])
  })

  test('pie colours stay on their category when earlier sectors are dropped', () => {
    // 第一个类别为 0 不成扇区；第二个类别的颜色仍是 colors[1]。
    const sparse = chart(['A', 'B', 'C'], [series('Share', [0, 5, 3])])
    const option = build('pie', sparse, { colors: ['#111111', '#222222', '#333333'] })
    const sectors = list(option)[0]!.data as { name: string; itemStyle?: { color: string } }[]
    expect(sectors.find((point) => point.name === 'B')?.itemStyle?.color).toBe('#222222')
  })

  test('the theme palette is the default colour list', () => {
    const option = build('column', columns)
    expect(option.color).toEqual(LIGHT_CHART_THEME.palette)
  })
})

describe('font size', () => {
  test('fontSize sets the global text and every axis label, defaulting to 12', () => {
    expect(at(build('column', columns).textStyle)).toMatchObject({ fontSize: 12 })
    const option = build('column', columns, { fontSize: 20 })
    expect(at(option.textStyle)).toMatchObject({ fontSize: 20 })
    expect(at(at(option.xAxis).axisLabel)).toMatchObject({ fontSize: 20 })
    expect(at(at(option.yAxis).axisLabel)).toMatchObject({ fontSize: 20 })
  })
})

describe('grid margins', () => {
  test('default column leaves room for a right legend and the top edge', () => {
    expect(at(build('column', columns).grid)).toMatchObject({
      top: 16, bottom: 12, left: 12, right: 112,
      outerBoundsMode: 'same', outerBoundsContain: 'axisLabel',
    })
  })

  test('title, legend side and axis titles each push the plot area inwards', () => {
    const grid = (over: Partial<ChartSpec>) => at(build('column', columns, over).grid)
    expect(grid({ title: 'T' })).toMatchObject({ top: 40 })
    expect(grid({ legend: 'top' })).toMatchObject({ top: 44 })
    expect(grid({ legend: 'top', title: 'T' })).toMatchObject({ top: 68 })
    expect(grid({ legend: 'bottom' })).toMatchObject({ bottom: 40 })
    expect(grid({ legend: 'left' })).toMatchObject({ left: 108, right: 16 })
    expect(grid({ legend: 'none' })).toMatchObject({ right: 16 })
    expect(grid({ xTitle: 'X' })).toMatchObject({ bottom: 34 })
    expect(grid({ yTitle: 'Y' })).toMatchObject({ left: 34 })
  })

  test('pie charts have no cartesian grid', () => {
    expect(build('pie', pie).grid).toBeUndefined()
    expect(build('scatter', chart(['a'], [series('Y', [1])])).grid).toBeDefined()
  })
})

describe('empty cells', () => {
  const gaps = chart(['Q1', 'Q2', 'Q3'], [series('A', [1, null, 3])])
  const points = (option: ChartOption) =>
    (list(option)[0]!.data as { value: number | null }[]).map((point) => point.value)

  test('gap keeps empty cells as null', () => {
    expect(points(build('column', gaps, { emptyCells: 'gap' }))).toEqual([1, null, 3])
  })

  test('zero turns empty cells into 0', () => {
    expect(points(build('column', gaps, { emptyCells: 'zero' }))).toEqual([1, 0, 3])
  })

  test('connect keeps null values and joins the line across them', () => {
    const option = build('line', gaps, { emptyCells: 'connect' })
    expect(points(option)).toEqual([1, null, 3])
    expect(list(option)[0]).toMatchObject({ connectNulls: true })
  })
})

describe('theme', () => {
  test('light theme sets palette, transparent background and text colours', () => {
    const option = build('column', columns)
    expect(option).toMatchObject({ backgroundColor: 'transparent', animation: false })
    expect(at(option.textStyle)).toMatchObject({ color: LIGHT_CHART_THEME.text,
      fontFamily: LIGHT_CHART_THEME.fontFamily })
    expect(at(option.tooltip).backgroundColor).toBe(LIGHT_CHART_THEME.background)
  })

  test('dark theme swaps palette, text and tooltip background', () => {
    const dark = chartTheme(true)
    const option = build('column', columns, {}, dark)
    expect(option.color).toEqual(dark.palette)
    expect(at(option.textStyle).color).toBe(dark.text)
    expect(at(option.tooltip).backgroundColor).toBe(dark.background)
    expect(at(option.tooltip).borderColor).toBe(dark.axisLine)
  })

  test('chartTheme picks the light theme unless dark is requested', () => {
    expect(chartTheme(false).background).toBe('#ffffff')
    expect(chartTheme(true).background).toBe('#1c1b27')
  })
})
