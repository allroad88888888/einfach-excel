import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import { getViewportScrollForCell, scrollToCellAtom, setViewportMetricsAtom,
  viewportMetricsAtom, type ViewportMetrics } from '../src'

const metrics: ViewportMetrics = {
  sheetId: 'sheet', scrollTop: 0, scrollLeft: 0,
  viewportHeight: 100, viewportWidth: 200,
  rowHeight: 20, colWidth: 50, rowCount: 1000, colCount: 100,
  overscanRows: 1, overscanCols: 1,
}
const range = { rowStart: 39, rowEnd: 40, colStart: 5, colEnd: 6 }
const input = { coord: { row: 39, col: 5 }, range }

describe('range navigation keeps the fill corner visible', () => {
  test('reveals both endpoints, not just the first cell', () => {
    expect(getViewportScrollForCell(metrics, input)).toEqual({ scrollTop: 720, scrollLeft: 150 })
  })

  test('does not scroll a fully visible range', () => {
    expect(getViewportScrollForCell({ ...metrics, scrollTop: 720, scrollLeft: 150 }, input))
      .toEqual({ scrollTop: 720, scrollLeft: 150 })
  })

  test('reveals the start when approaching a range from below and right', () => {
    expect(getViewportScrollForCell({ ...metrics, scrollTop: 900, scrollLeft: 500 }, input))
      .toEqual({ scrollTop: 780, scrollLeft: 250 })
  })

  test('falls back to the active cell independently on oversized axes', () => {
    expect(getViewportScrollForCell(metrics, {
      ...input, range: { ...range, rowEnd: 999 },
    })).toEqual({ scrollTop: 700, scrollLeft: 150 })
    expect(getViewportScrollForCell(metrics, {
      ...input, range: { ...range, colEnd: 99 },
    })).toEqual({ scrollTop: 720, scrollLeft: 100 })
  })

  test('counts variable sizes and hidden bands instead of multiplying indices', () => {
    expect(getViewportScrollForCell(metrics, input, { '39': 60, '40': 0 }, { '5': 80 }))
      .toEqual({ scrollTop: 740, scrollLeft: 180 })
  })

  test('excludes frozen bands from the scrollable area', () => {
    const freeze = { rows: 1, cols: 1, height: 20, width: 50 }
    expect(getViewportScrollForCell(metrics, input, undefined, undefined, freeze))
      .toEqual({ scrollTop: 720, scrollLeft: 150 })
    // Frozen anchor does not prevent revealing the rest of a short range.
    expect(getViewportScrollForCell({ ...metrics, scrollTop: 100, scrollLeft: 100 }, {
      coord: { row: 0, col: 0 },
      range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
    }, undefined, undefined, freeze)).toEqual({ scrollTop: 0, scrollLeft: 0 })
  })

  test('leaves wholly frozen targets and fully frozen viewports at their current offset', () => {
    const current = { ...metrics, scrollTop: 100, scrollLeft: 100 }
    expect(getViewportScrollForCell(current, {
      coord: { row: 0, col: 0 },
      range: { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 },
    }, undefined, undefined, { rows: 1, cols: 1, height: 20, width: 50 }))
      .toEqual({ scrollTop: 100, scrollLeft: 100 })
    expect(getViewportScrollForCell(current, input, undefined, undefined,
      { rows: 10, cols: 10, height: 200, width: 500 }))
      .toEqual({ scrollTop: 100, scrollLeft: 100 })
  })

  test('clamps range endpoints at the sheet edge', () => {
    expect(getViewportScrollForCell(metrics, {
      coord: { row: 999, col: 99 },
      range: { rowStart: 998, rowEnd: 9999, colStart: 98, colEnd: 999 },
    })).toEqual({ scrollTop: 19900, scrollLeft: 4800 })
  })

  test('the existing command uses immediate DOM viewport measurements for ranges', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, metrics)
    store.setter(scrollToCellAtom, { ...input,
      viewport: { viewportHeight: 80, viewportWidth: 150 },
    })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      viewportHeight: 80, viewportWidth: 150, scrollTop: 740, scrollLeft: 200,
    })
  })
})
