import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  setViewportMetricsAtom,
  setViewportScrollAtom,
  setViewportSizeAtom,
  viewportMetricsAtom,
  initializeViewportMetricsAtom,
} from '../src/viewport'

describe('viewport metric commands', () => {
  test('same-sheet canvas changes preserve physical scroll and measured viewport', () => {
    const store = createStore()
    const initial = {
      ...store.getter(viewportMetricsAtom),
      sheetId: 's',
      rowCount: 100,
      colCount: 16,
      viewportHeight: 320,
      viewportWidth: 420,
    }
    store.setter(initializeViewportMetricsAtom, initial)
    store.setter(setViewportScrollAtom, { scrollTop: 1500, scrollLeft: 300 })
    store.setter(initializeViewportMetricsAtom, {
      ...initial,
      rowCount: 99,
      colCount: 15,
      viewportHeight: 800,
      viewportWidth: 900,
    })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      rowCount: 99,
      colCount: 15,
      scrollTop: 1500,
      scrollLeft: 300,
      viewportHeight: 320,
      viewportWidth: 420,
    })
    store.setter(initializeViewportMetricsAtom, {
      ...initial,
      sheetId: 'next',
      viewportHeight: 896,
      viewportWidth: 960,
    })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({
      sheetId: 'next',
      viewportHeight: 320,
      viewportWidth: 420,
      scrollTop: 0,
      scrollLeft: 0,
    })
  })
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
