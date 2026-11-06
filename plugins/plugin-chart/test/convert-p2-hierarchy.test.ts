import { describe, expect, test } from 'vitest'
import { chartIssue, isPlottable } from '../src/core/convert'
import { buildHierarchy } from '../src/core/convert/hierarchy'
import { colorSlots } from '../src/core/color-slots'
import { at, build, chart, list, series, spec, textColumn, tooltip } from './convert-p2-helpers'

/** Region | Product | Sales：前两列是层级类别，最后一列是数值。 */
const sales = chart(['East', 'East', 'West', 'West'],
  [textColumn('Product', ['A', 'B', 'A', 'C']), series('Sales', [10, 5, 7, 3])])

describe('hierarchy', () => {
  test('category columns build the tree and parents sum their children', () => {
    expect(buildHierarchy(sales)).toEqual([
      { name: 'East', value: 15, children: [{ name: 'A', value: 10 }, { name: 'B', value: 5 }] },
      { name: 'West', value: 10, children: [{ name: 'A', value: 7 }, { name: 'C', value: 3 }] },
    ])
  })

  test('a blank first level reuses the row above, repeated paths add up', () => {
    const data = chart(['East', '', 'East'],
      [textColumn('Product', ['A', 'B', 'A']), series('Sales', [1, 2, 3])])
    expect(buildHierarchy(data)).toEqual([
      { name: 'East', value: 6, children: [{ name: 'A', value: 4 }, { name: 'B', value: 2 }] },
    ])
  })

  test('a blank deeper level stops the path; non-positive and empty values are dropped', () => {
    const data = chart(['East', 'East', 'West', 'West'],
      [textColumn('Product', ['', 'B', 'A', 'C']), series('Sales', [4, 0, -1, null])])
    expect(buildHierarchy(data)).toEqual([{ name: 'East', value: 4 }])
  })

  test('without a category column the first series column is the first level', () => {
    const data = chart(['1', '2'], [textColumn('Group', ['G', 'G']), series('N', [1, 2])], false)
    expect(buildHierarchy(data)).toEqual([{ name: 'G', value: 3 }])
  })

  test('a single column has no hierarchy and is reported', () => {
    const data = chart(['a'], [])
    expect(buildHierarchy(data)).toEqual([])
    expect(chartIssue(spec('treemap'), data)).toMatch(/category columns/)
    expect(chartIssue(spec('sunburst'), data)).toMatch(/category columns/)
    expect(chartIssue(spec('treemap'), sales)).toBeNull()
  })

  test('nothing positive is not plottable', () => {
    const data = chart(['a'], [textColumn('P', ['x']), series('N', [0])])
    expect(isPlottable(spec('treemap'), data)).toBe(false)
    expect(isPlottable(spec('sunburst'), sales)).toBe(true)
  })

  test('colors are per top-level category', () => {
    expect(colorSlots(spec('treemap'), sales).map((slot) => slot.name)).toEqual(['East', 'West'])
  })
})

describe('treemap and sunburst options', () => {
  test('treemap series carries the tree with one color per top-level node', () => {
    const option = build('treemap', sales, { colors: ['#123456'] })
    const [treemap] = list(option)
    expect(treemap).toMatchObject({ type: 'treemap', roam: false })
    const roots = treemap!.data as { name: string; itemStyle: { color: string } }[]
    expect(roots.map((root) => root.name)).toEqual(['East', 'West'])
    expect(roots[0]!.itemStyle.color).toBe('#123456')
    expect(roots[1]!.itemStyle.color).not.toBe('#123456')
    expect(option.legend).toEqual({ show: false })
  })

  test('sunburst keeps row order and tooltip shows the path and value', () => {
    const option = build('sunburst', sales)
    expect(list(option)[0]).toMatchObject({ type: 'sunburst', sort: null })
    const html = tooltip(option).formatter({
      name: 'A', value: 10, treePathInfo: [{ name: '' }, { name: 'East' }, { name: 'A' }] })
    expect(html).toBe('East / A<br/>10')
  })

  test('data labels add the value to node names', () => {
    const label = (type: 'treemap' | 'sunburst', dataLabels: boolean) =>
      at(at(list(build(type, sales, { dataLabels }))[0]).label).formatter
    expect(label('treemap', true)).toBe('{b}\n{c}')
    expect(label('sunburst', false)).toBe('{b}')
  })

  test('invalid or empty data draws nothing', () => {
    expect(list(build('treemap', chart(['a'], [])))).toEqual([])
    expect(list(build('sunburst', chart(['a'], [textColumn('P', ['x']), series('N', [null])]))))
      .toEqual([])
  })
})
