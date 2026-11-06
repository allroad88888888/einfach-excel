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
const chart = (categories: string[], list: ChartSeries[], xValues: ChartData['xValues'] = null):
  ChartData => ({ categories, xValues, series: list })
const build = (type: ChartType, data: ChartData, over: Partial<ChartSpec> = {}): ChartOption =>
  toEChartsOption({ spec: spec(type, over), data, theme: LIGHT_CHART_THEME })
const list = (option: ChartOption) => option.series as unknown as Loose[]
const at = (value: unknown) => value as Loose

const sectors = (option: ChartOption) =>
  (list(option)[0]!.data as { name: string; value: number; label: string }[])

/** 饼图：只画第一个系列，负值 / 零 / 空值不成扇区。 */
describe('pie and doughnut sectors', () => {
  const data = chart(['A', 'B', 'C', 'D', 'E'],
    [series('Share', [3, 0, null, -2, 5]), series('Other', [1, 1, 1, 1, 1])])

  test('pie keeps only positive sectors and draws only the first series', () => {
    const option = build('pie', data)
    expect(list(option)).toHaveLength(1)
    expect(list(option)[0]).toMatchObject({ type: 'pie', name: 'Share', percentPrecision: 1,
      avoidLabelOverlap: true })
    expect(sectors(option)).toEqual([
      { name: 'A', value: 3, label: '3', slot: 0 },
      { name: 'E', value: 5, label: '5', slot: 4 },
    ])
  })

  test('pie with no series yields no sectors', () => {
    const option = build('pie', chart(['A'], []))
    expect(sectors(option)).toEqual([])
    expect(list(option)[0]).toMatchObject({ name: '' })
  })

  test('radius: a full disc without legend or title, a ring for doughnut', () => {
    expect(list(build('pie', data, { legend: 'none' }))[0]).toMatchObject({ radius: '68%' })
    expect(list(build('pie', data))[0]).toMatchObject({ radius: '58%' })
    expect(list(build('pie', data, { legend: 'none', title: 'T' }))[0])
      .toMatchObject({ radius: '58%' })
    expect(list(build('doughnut', data, { legend: 'none' }))[0])
      .toMatchObject({ radius: ['40%', '68%'] })
    expect(list(build('doughnut', data))[0]).toMatchObject({ radius: ['34%', '58%'] })
  })

  test('centre moves away from the legend side and below a title or top legend', () => {
    const centre = (over: Partial<ChartSpec>) => list(build('pie', data, over))[0]!.center
    expect(centre({ legend: 'right' })).toEqual(['42%', '50%'])
    expect(centre({ legend: 'left' })).toEqual(['58%', '50%'])
    expect(centre({ legend: 'bottom' })).toEqual(['50%', '45%'])
    expect(centre({ legend: 'top' })).toEqual(['50%', '54%'])
    expect(centre({ legend: 'top', title: 'T' })).toEqual(['50%', '58%'])
    expect(centre({ legend: 'none' })).toEqual(['50%', '50%'])
    expect(centre({ legend: 'none', title: 'T' })).toEqual(['50%', '54%'])
  })
})

describe('scatter points', () => {
  test('the first column supplies X and each series supplies Y as [x, y] pairs', () => {
    const data = chart(['a', 'b', 'c'], [series('Y', [10, null, 30])], [1, 2, 3])
    const option = build('scatter', data)
    expect(list(option)[0]).toMatchObject({ type: 'scatter', name: 'Y', symbolSize: 8 })
    expect((list(option)[0]!.data as { value: unknown }[]).map((point) => point.value))
      .toEqual([[1, 10], [3, 30]])
  })

  test('without a name column X is the 1-based row number; a null X drops the point', () => {
    const sequence = build('scatter', chart(['x', 'y'], [series('Y', [5, 6])]))
    expect((list(sequence)[0]!.data as { value: unknown }[])[1]!.value).toEqual([2, 6])
    const gap = build('scatter', chart(['a', 'b'], [series('Y', [5, 6])], [null, 2]))
    expect((list(gap)[0]!.data as { value: unknown }[]).map((point) => point.value))
      .toEqual([[2, 6]])
  })

  test('each data column becomes its own scatter series', () => {
    const option = build('scatter', chart(['a'], [series('P', [1]), series('Q', [2])], [7]))
    expect(list(option).map((entry) => entry.name)).toEqual(['P', 'Q'])
  })

  test('both axes are value axes; only the Y axis honours yMin/yMax', () => {
    const option = build('scatter', chart(['a'], [series('Y', [1])], [1]),
      { yMin: 0, yMax: 50 })
    expect(at(option.xAxis)).toMatchObject({ type: 'value', min: undefined, max: undefined,
      scale: true })
    expect(at(option.yAxis)).toMatchObject({ type: 'value', min: 0, max: 50, scale: true })
  })

  test('axis titles map to X (xTitle) and Y (yTitle)', () => {
    const option = build('scatter', chart(['a'], [series('Y', [1])], [1]),
      { xTitle: 'Height', yTitle: 'Weight' })
    expect(at(option.xAxis).name).toBe('Height')
    expect(at(option.yAxis).name).toBe('Weight')
  })
})
