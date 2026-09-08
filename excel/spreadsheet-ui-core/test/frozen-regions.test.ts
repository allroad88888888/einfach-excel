import { expect, test } from 'vitest'
import { getFrozenRegions } from '../src/viewport/frozen-regions'

const window = { rowStart: 100, rowEnd: 110, colStart: 20, colEnd: 25 }
const viewport = { height: 280, width: 600, rowHeight: 28, colWidth: 120 }
const empty = new Set<number>()

test('ordinary two-axis freeze reads three disjoint strips beside the scrolling window', () => {
  expect(getFrozenRegions(window, { rows: 2, cols: 1 }, viewport, {}, {}, empty, empty)).toEqual({
    height: 56,
    width: 120,
    regions: [
      { pane: 'corner', window: { rowStart: 0, rowEnd: 1, colStart: 0, colEnd: 0 } },
      { pane: 'top', window: { rowStart: 0, rowEnd: 1, colStart: 20, colEnd: 25 } },
      { pane: 'left', window: { rowStart: 100, rowEnd: 110, colStart: 0, colEnd: 0 } },
    ],
  })
})

test('a million frozen rows and thousands of columns still read only screen-sized data', () => {
  const result = getFrozenRegions(
    window,
    { rows: 1_000_000, cols: 16_000 },
    viewport,
    {},
    {},
    empty,
    empty,
  )
  expect(result.height).toBe(28_000_000)
  expect(result.width).toBe(1_920_000)
  expect(result.regions).toEqual([
    { pane: 'corner', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 4 } },
  ])
})

test('partially visible cells are included, but the exact pixel boundary adds no extra row', () => {
  for (const [height, rowEnd] of [
    [28, 0],
    [28.1, 1],
    [56, 1],
  ]) {
    const result = getFrozenRegions(
      window,
      { rows: 1000, cols: 0 },
      { ...viewport, height },
      {},
      {},
      empty,
      empty,
    )
    expect(result.regions[0]).toMatchObject({ pane: 'top', window: { rowEnd } })
  }
})

test('actual dimensions control clipping independently of sizes in the scrolled window', () => {
  const result = getFrozenRegions(
    window,
    { rows: 1000, cols: 100 },
    viewport,
    { 0: 200, 1: 60, 2: 80, 100: 512 },
    { 0: 450, 1: 200, 20: 1024 },
    empty,
    empty,
  )
  expect(result.regions).toEqual([
    { pane: 'corner', window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 1 } },
  ])
})

test('hidden gaps split reads and use neither pixels nor visible-cell budget', () => {
  const hiddenRows = new Set(Array.from({ length: 100_000 }, (_, i) => i + 1))
  const result = getFrozenRegions(
    window,
    { rows: 100_010, cols: 3 },
    { ...viewport, height: 56, width: 240 },
    {},
    {},
    hiddenRows,
    new Set([1]),
    4,
  )
  expect(result.height).toBe(280)
  expect(result.width).toBe(240)
  expect(result.regions).toHaveLength(4)
  expect(
    result.regions.map(({ window: w }) => [w.rowStart, w.rowEnd, w.colStart, w.colEnd]),
  ).toEqual([
    [0, 0, 0, 0],
    [0, 0, 2, 2],
    [100_001, 100_001, 0, 0],
    [100_001, 100_001, 2, 2],
  ])
})

test('hidden entire band, zero-size screen and absent freeze require no frozen cell reads', () => {
  expect(
    getFrozenRegions(window, { rows: 2, cols: 1 }, viewport, {}, {}, new Set([0, 1]), new Set([0]))
      .regions,
  ).toEqual([])
  expect(
    getFrozenRegions(
      window,
      { rows: 2, cols: 1 },
      { ...viewport, height: 0, width: 0 },
      {},
      {},
      empty,
      empty,
    ).regions,
  ).toEqual([])
  expect(getFrozenRegions(window, { rows: 0, cols: 0 }, viewport, {}, {}, empty, empty)).toEqual({
    height: 0,
    width: 0,
    regions: [],
  })
})

test('frozen rows are not duplicated in the left strip while the grid is at the origin', () => {
  const result = getFrozenRegions(
    { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 },
    { rows: 2, cols: 2 },
    viewport,
    {},
    {},
    empty,
    empty,
  )
  expect(result.regions[1].window).toEqual({ rowStart: 0, rowEnd: 1, colStart: 2, colEnd: 5 })
  expect(result.regions[2].window).toEqual({ rowStart: 2, rowEnd: 5, colStart: 0, colEnd: 1 })
})

test('all strips share a bounded read budget', () => {
  expect(() =>
    getFrozenRegions(window, { rows: 2, cols: 1 }, viewport, {}, {}, empty, empty, 24),
  ).toThrow('visible cell budget')
})
