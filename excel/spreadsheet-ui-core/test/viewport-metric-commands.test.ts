import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  setViewportMetricsAtom,
  setViewportScrollAtom,
  setViewportSizeAtom,
  viewportMetricsAtom,
} from '../src/viewport'

describe('viewport metric commands', () => {
  test('size and scroll updates merge into the latest metrics', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, {
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 300,
      viewportWidth: 400,
      rowHeight: 20,
      colWidth: 80,
      rowCount: 100,
      colCount: 20,
      overscanRows: 0,
      overscanCols: 0,
    })

    store.setter(setViewportScrollAtom, { scrollTop: 120, scrollLeft: 40 })
    store.setter(setViewportSizeAtom, { viewportHeight: 320, viewportWidth: 420 })

    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      scrollTop: 120,
      scrollLeft: 40,
      viewportHeight: 320,
      viewportWidth: 420,
    })
  })
})
