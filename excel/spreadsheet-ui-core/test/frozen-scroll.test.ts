import { expect, test } from 'vitest'
import { DEFAULT_VIEWPORT_METRICS, getViewportScrollForCell } from '../src/viewport/metrics'

const metrics = {
  ...DEFAULT_VIEWPORT_METRICS,
  rowCount: 1000,
  colCount: 30,
  rowHeight: 28,
  colWidth: 120,
  viewportHeight: 280,
  viewportWidth: 600,
  scrollTop: 500,
  scrollLeft: 400,
}
const freeze = { rows: 2, cols: 1, height: 56, width: 120 }

test('selecting a frozen cell never moves either scrollbar', () => {
  expect(getViewportScrollForCell(metrics, { coord: { row: 0, col: 0 } }, {}, {}, freeze)).toEqual({
    scrollTop: 500,
    scrollLeft: 400,
  })
})
test('the first scrolling row and column must land beyond the frozen band', () => {
  expect(getViewportScrollForCell(metrics, { coord: { row: 2, col: 1 } }, {}, {}, freeze)).toEqual({
    scrollTop: 0,
    scrollLeft: 0,
  })
})
test('the final cell still fits at the far edge without extra gutter pixels', () => {
  expect(
    getViewportScrollForCell(metrics, { coord: { row: 999, col: 29 } }, {}, {}, freeze),
  ).toEqual({ scrollTop: 27_720, scrollLeft: 3000 })
})
test('align start and nonuniform frozen dimensions use the same pixel boundary', () => {
  expect(
    getViewportScrollForCell(
      metrics,
      { coord: { row: 3, col: 2 }, rowAlign: 'start', colAlign: 'start' },
      { 0: 56 },
      { 0: 200 },
      { ...freeze, height: 84, width: 200 },
    ),
  ).toEqual({ scrollTop: 28, scrollLeft: 120 })
})
