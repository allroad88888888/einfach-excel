import { describe, expect, test } from 'vitest'
import { scottBins } from '../src/core/convert/histogram'
import { at, build, chart, list, series, tooltip } from './convert-p2-helpers'

/** 数据项可以是数值（垫底柱）或带 value 的对象。 */
const values = (entry: unknown) => (at(entry).data as unknown[]).map((point) =>
  point !== null && typeof point === 'object' ? (point as { value: number | null }).value : point)
const colors = (entry: unknown) =>
  (at(entry).data as { itemStyle: { color: string } }[]).map((point) => point.itemStyle.color)

describe('waterfall', () => {
  test('each value is a delta drawn from the running total, increase and decrease differ in color', () => {
    const option = build('waterfall', chart(['Start', 'Sales', 'Cost', 'Total'],
      [series('Money', [100, 50, -30, 120])]))
    const [base, positive, negative] = list(option)
    // 100 → 150 → 120：第一根从 0 起，随后抬高，再回落；Total 是 0→120 的汇总柱。
    expect(values(base)).toEqual([0, 100, 120, 0])
    expect(values(positive)).toEqual([100, 50, 30, 120])
    expect(values(negative)).toEqual([null, null, null, null])
    expect(base).toMatchObject({ itemStyle: { color: 'transparent' }, silent: true })
    const [up, , down, total] = colors(positive)
    expect(new Set([up, down, total]).size).toBe(3)
  })

  test('bars below zero are held up by a negative base, crossing zero splits in two', () => {
    const option = build('waterfall', chart(['a', 'b', 'c'], [series('S', [-10, -20, 50])]))
    const [base, positive, negative] = list(option)
    // 0→-10（全在零线下）、-10→-30（全在零线下）、-30→20（跨零线）。
    expect(values(base)).toEqual([0, -10, null])
    expect(values(positive)).toEqual([null, null, 20])
    expect(values(negative)).toEqual([-10, -20, -30])
  })

  test('total rows reset the running sum and empty cells add nothing', () => {
    const option = build('waterfall', chart(['a', 'Subtotal', 'b'], [series('S', [10, 5, null])]))
    const [base, positive] = list(option)
    expect(values(positive)).toEqual([10, 5, 0])
    expect(values(base)).toEqual([0, 0, 5])
  })

  test('data labels show the cell text on one segment only and the tooltip shows the running total', () => {
    const data = chart(['a', 'b'], [series('S', [10, -4], ['10.0', '(4)'])])
    const option = build('waterfall', data, { dataLabels: true })
    const [, positive, negative] = list(option)
    expect(at(positive.label).show).toBe(true)
    const labelOf = (entry: Record<string, unknown>, index: number) =>
      (entry.data as { label: string }[])[index]!.label
    expect([labelOf(positive!, 0), labelOf(positive!, 1)]).toEqual(['10.0', '(4)'])
    expect([labelOf(negative!, 0), labelOf(negative!, 1)]).toEqual(['', ''])
    expect(tooltip(option).formatter([{ dataIndex: 1 }])).toBe('b<br/>(4) → 6')
  })

  test('uses only the first series and nothing without one', () => {
    expect(list(build('waterfall', chart(['a'], [])))).toEqual([])
  })
})

describe('histogram scott bins', () => {
  test('width follows Scott rule and the right edge is closed', () => {
    // n=8，样本标准差≈3.165 → 箱宽≈5.52 → ceil(9/5.52)=2 箱，每箱 4.5。
    const bins = scottBins([1, 2, 2, 3, 4, 5, 8, 10])
    expect(bins).toHaveLength(2)
    expect(bins[0]).toMatchObject({ from: 1, to: 5.5 })
    expect(bins.map((bin) => bin.count)).toEqual([6, 2])
    expect(bins.reduce((sum, bin) => sum + bin.count, 0)).toBe(8)
  })

  test('boundary values fall into the lower bin, identical values give one bin', () => {
    const [low, high] = scottBins([0, 5, 10, 10, 0, 5, 5, 10, 2, 8, 0, 10, 5])
    expect(low!.to).toBe(high!.from)
    expect(scottBins([4, 4, 4])).toEqual([{ from: 4, to: 4, count: 3 }])
    expect(scottBins([])).toEqual([])
  })
})

describe('histogram option', () => {
  test('first series is binned, labels use half-open intervals and counts are the bar values', () => {
    const numbers = [1, 2, 2, 3, 4, 5, 8, 10]
    const option = build('histogram', chart(numbers.map(String),
      [series('Score', numbers), series('Ignored', numbers.map(() => 1))]))
    expect(list(option)).toHaveLength(1)
    const axis = at(option.xAxis)
    expect(axis.data).toEqual(['[1, 5.5]', '(5.5, 10]'])
    expect(at(axis).boundaryGap).toBe(true)
    expect(values(list(option)[0])).toEqual([6, 2])
    expect(tooltip(option).formatter([{ dataIndex: 0 }])).toBe('[1, 5.5]<br/>Count: 6')
  })

  test('non-numeric rows are skipped; no numbers at all draws nothing', () => {
    const option = build('histogram', chart(['a', 'b', 'c'], [series('S', [1, null, 3])]))
    expect(values(list(option)[0]).reduce<number>((sum, n) => sum + Number(n), 0)).toBe(2)
    expect(list(build('histogram', chart(['a'], [series('S', [null])])))).toEqual([])
  })
})
