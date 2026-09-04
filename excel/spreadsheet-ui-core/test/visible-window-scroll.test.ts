import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  scrollToCellAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  visibleWindowAtom,
} from '../src'

describe('visible window scroll atoms', () => {
  test('covers the viewport when scrolling clips the first row and column', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, {
      scrollTop: 41,
      scrollLeft: 101,
      viewportHeight: 100,
      viewportWidth: 200,
      rowHeight: 20,
      colWidth: 50,
      rowCount: 1_000,
      colCount: 100,
      overscanRows: 0,
      overscanCols: 0,
    })

    expect(store.getter(visibleWindowAtom)).toEqual({
      rowStart: 2,
      rowEnd: 7,
      colStart: 2,
      colEnd: 6,
    })
  })

  test('derives a fixed grid window and scrolls it through viewport metrics', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, {
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 32 * 28,
      viewportWidth: 8,
      rowHeight: 28,
      colWidth: 1,
      rowCount: 1_001,
      colCount: 8,
      overscanRows: 0,
      overscanCols: 0,
    })

    expect(store.getter(visibleWindowAtom)).toEqual({
      rowStart: 0,
      rowEnd: 31,
      colStart: 0,
      colEnd: 7,
    })

    store.setter(scrollToCellAtom, {
      coord: { row: 999, col: 0 },
      rowAlign: 'start',
      colAlign: 'start',
    })

    expect(store.getter(visibleWindowAtom)).toEqual({
      rowStart: 969,
      rowEnd: 1_000,
      colStart: 0,
      colEnd: 7,
    })
    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(969 * 28)
  })
})
