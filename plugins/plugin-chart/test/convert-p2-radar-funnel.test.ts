import { describe, expect, test } from 'vitest'
import { at, build, chart, list, series, tooltip } from './convert-p2-helpers'

describe('radar', () => {
  const data = chart(['Speed', 'Power', 'Skill'],
    [series('A', [60, 80, 40]), series('B', [30, null, 90])])

  test('one axis per category with a shared scale and one polygon per series', () => {
    const option = build('radar', data)
    const radar = at(option.radar)
    expect((radar.indicator as Record<string, unknown>[]).map((i) => i.name))
      .toEqual(['Speed', 'Power', 'Skill'])
    // 最大值 90 取到 1.5 / 2 / 2.5… × 10ⁿ 的上界，所有轴同一刻度。
    expect(radar.indicator).toEqual(Array(3).fill(expect.objectContaining({ min: 0, max: 90 })))
    const polygons = at(list(option)[0]).data as Record<string, unknown>[]
    expect(list(option)[0]).toMatchObject({ type: 'radar' })
    expect(polygons.map((p) => p.name)).toEqual(['A', 'B'])
    // 空值按 0 画。
    expect(polygons[1]!.value).toEqual([30, 0, 90])
  })

  test('negative data lowers the shared minimum and colors follow the settings', () => {
    const option = build('radar', chart(['x', 'y'], [series('S', [-5, 10])]),
      { colors: ['#112233'] })
    expect(at(option.radar).indicator).toEqual(Array(2).fill(
      expect.objectContaining({ min: -5, max: 10 })))
    expect(at(at(list(option)[0]!.data as unknown[])[0]).itemStyle).toEqual({ color: '#112233' })
  })

  test('data labels use the cell text and tooltip lists every axis', () => {
    const option = build('radar', data, { dataLabels: true })
    const label = at(list(option)[0]!.label)
    expect(label.show).toBe(true)
    expect((label.formatter as (p: unknown) => string)({ dataIndex: 0, dimensionIndex: 2 }))
      .toBe('40')
    const html = tooltip(option).formatter({ dataIndex: 1, marker: '' })
    expect(html).toContain('B')
    expect(html).toContain('Skill: 90')
  })

  test('no categories or no numbers draws nothing', () => {
    expect(list(build('radar', chart([], [series('A', [])])))).toEqual([])
    expect(list(build('radar', chart(['a'], [series('A', [null])])))).toEqual([])
  })
})

describe('funnel', () => {
  const data = chart(['Visit', 'Cart', 'Pay', 'Skip'],
    [series('Users', [1000, 400, 120, null], ['1,000', '400', '120', '']), series('Other', [1, 1, 1, 1])])

  test('draws only the first series, keeps row order and aligns every category', () => {
    const option = build('funnel', data)
    expect(list(option)).toHaveLength(1)
    const funnel = list(option)[0]!
    expect(funnel).toMatchObject({ type: 'funnel', name: 'Users', sort: 'none' })
    const points = funnel.data as Record<string, unknown>[]
    expect(points.map((p) => [p.name, p.value])).toEqual(
      [['Visit', 1000], ['Cart', 400], ['Pay', 120], ['Skip', 0]])
    expect(points[0]!.label).toBe('1,000')
  })

  test('colors are per layer and labels switch with data labels and legend', () => {
    const option = build('funnel', data, { colors: ['#aa0000'] })
    const points = list(option)[0]!.data as { itemStyle: { color: string } }[]
    expect(points[0]!.itemStyle.color).toBe('#aa0000')
    expect(points[1]!.itemStyle.color).not.toBe('#aa0000')
    const format = (over: object, p: object) =>
      (at(at(list(build('funnel', data, over))[0]).label).formatter as (x: unknown) => string)(p)
    const p = { name: 'Cart', data: { label: '400' } }
    expect(format({}, p)).toBe('Cart')
    expect(format({ dataLabels: true }, p)).toBe('400')
    expect(format({ dataLabels: true, legend: 'none' }, p)).toBe('Cart: 400')
  })

  test('without series nothing is drawn', () => {
    expect(list(build('funnel', chart(['a'], [])))).toEqual([])
  })
})
