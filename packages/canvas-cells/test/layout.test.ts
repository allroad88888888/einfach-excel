import { expect, test } from 'vitest'
import { createLayout } from '../src/layout'

const window = { rowStart: 5, rowEnd: 7, colStart: 2, colEnd: 4 }
test('binary hit testing retains absolute coordinates across hidden variable-sized axes', () => {
  const layout = createLayout({ window, cells: [],
    rowHeights: [20, 0, 40], columnWidths: [30, 0, 60] })
  expect(layout.items).toHaveLength(4)
  expect([layout.width, layout.height]).toEqual([90, 60])
  expect(layout.hit(29, 19)).toEqual({ row: 5, col: 2 })
  expect(layout.hit(30, 20)).toEqual({ row: 7, col: 4 })
  expect(layout.hit(90, 20)).toBeNull()
  expect(layout.hit(-1, 20)).toBeNull()
})

test('offscreen merge anchors preserve full bounds and suppress covered ordinary cells', () => {
  const range = { rowStart: 4, rowEnd: 6, colStart: 1, colEnd: 3 }
  const layout = createLayout({ window, cells: [], mergedRanges: [range], mergeAnchors: [
    { row: 4, col: 1, displayValue: 'Merged', mergedSpan: { rows: 3, cols: 3 } },
  ] })
  const merge = layout.items.find(item => item.merged)!
  expect(merge.bounds).toEqual({ x: -120, y: -28, width: 360, height: 84 })
  expect(layout.hit(10, 10)).toEqual({ row: 4, col: 1 })
  expect(layout.items).toHaveLength(6)
  expect(layout.items.some(item => item.key === 'c:5:2')).toBe(false)
})

test('zero sized windows and invalid sizes do not create drawable cells', () => {
  expect(createLayout({ window, cells: [], rowHeights: [0, 0, 0] }).items).toHaveLength(0)
  expect(createLayout({ window, cells: [], columnWidths: [0, 0, 0] }).hit(0, 0)).toBeNull()
  expect(() => createLayout({ window, cells: [], rowHeights: [-1] })).toThrow('non-negative')
})
