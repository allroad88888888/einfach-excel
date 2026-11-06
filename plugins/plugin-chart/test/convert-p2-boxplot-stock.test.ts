import { describe, expect, test } from 'vitest'
import { chartIssue, isPlottable } from '../src/core/convert'
import { boxStats } from '../src/core/convert/stats'
import { at, build, chart, list, series, spec, tooltip } from './convert-p2-helpers'

describe('boxStats uses the exclusive-median quartiles', () => {
  test('odd count leaves the median out of both halves', () => {
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9])).toMatchObject(
      { min: 1, q1: 2.5, median: 5, q3: 7.5, max: 9, mean: 5, outliers: [] })
  })

  test('even count splits into two equal halves', () => {
    expect(boxStats([8, 7, 6, 5, 4, 3, 2, 1])).toMatchObject(
      { q1: 2.5, median: 4.5, q3: 6.5 })
  })

  test('points beyond 1.5 IQR are outliers and whiskers stop at the last point inside', () => {
    expect(boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])).toMatchObject(
      { q1: 3, q3: 8, max: 9, outliers: [100] })
  })

  test('a single value collapses the box', () => {
    expect(boxStats([7])).toMatchObject({ min: 7, q1: 7, median: 7, q3: 7, max: 7 })
  })
})

describe('boxplot', () => {
  const data = chart(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], [
    series('Group A', [1, 2, 3, 4, 5, 6, 7, 8, 9, 100]),
    series('Empty', Array(10).fill(null)),
    series('Group B', [10, 10, 12, 12, 14, 14, 16, 16, 18, null]),
  ])

  test('one box per series with numbers, series names on the category axis', () => {
    const option = build('boxplot', data)
    expect(at(option.xAxis).data).toEqual(['Group A', 'Group B'])
    const [box, outliers, mean] = list(option)
    expect(box).toMatchObject({ type: 'boxplot' })
    const boxes = box!.data as { name: string; value: number[] }[]
    expect(boxes.map((b) => b.name)).toEqual(['Group A', 'Group B'])
    expect(boxes[0]!.value).toEqual([1, 3, 5.5, 8, 9])
    expect((outliers!.data as { value: number[] }[]).map((p) => p.value)).toEqual([[0, 100]])
    expect((mean!.data as { value: number[] }[]).map((p) => p.value[0])).toEqual([0, 1])
  })

  test('tooltip lists the five numbers and the mean for a box, the value for an outlier', () => {
    const option = build('boxplot', data)
    const html = tooltip(option).formatter({ seriesType: 'boxplot', dataIndex: 0 })
    expect(html).toBe('Group A<br/>Max: 9<br/>Q3: 8<br/>Median: 5.5<br/>Q1: 3<br/>Min: 1<br/>Mean: 14.5')
    expect(tooltip(option).formatter(
      { seriesType: 'scatter', seriesName: 'Outlier', name: 'Group A', value: [0, 100] }))
      .toBe('Group A<br/>Outlier: 100')
  })

  test('data without any number draws nothing', () => {
    expect(list(build('boxplot', chart(['a'], [series('S', [null])])))).toEqual([])
  })
})

describe('stock', () => {
  const days = ['Mon', 'Tue', 'Wed']
  const four = [
    series('Open', [10, 11, null]), series('High', [12, 13, 14]),
    series('Low', [9, 10, 11]), series('Close', [11, 10, 13]),
  ]

  test('four series become candles in ECharts order [open, close, low, high]', () => {
    const option = build('stock', chart(days, four))
    const [candles] = list(option)
    expect(candles).toMatchObject({ type: 'candlestick', name: 'Close' })
    // 缺开盘价的那天不画。
    expect(candles!.data).toEqual([[10, 11, 9, 12], [11, 10, 10, 13], '-'])
    expect(at(option.yAxis).scale).toBe(true)
  })

  test('up and down colors can be overridden', () => {
    const [candles] = list(build('stock', chart(days, four), { colors: ['#00ff00'] }))
    expect(at(candles!.itemStyle)).toMatchObject({ color: '#00ff00', borderColor: '#00ff00' })
    expect(at(candles!.itemStyle).color0).not.toBe('#00ff00')
  })

  test('anything but exactly four series is an error and draws nothing', () => {
    for (const count of [0, 3, 5]) {
      const data = chart(days, Array.from({ length: count }, (_, i) =>
        series(`S${i}`, [1, 2, 3])))
      expect(list(build('stock', data))).toEqual([])
      expect(chartIssue(spec('stock'), data)).toMatch(/exactly four/)
      expect(isPlottable(spec('stock'), data)).toBe(false)
    }
    expect(chartIssue(spec('stock'), chart(days, four))).toBeNull()
  })
})
