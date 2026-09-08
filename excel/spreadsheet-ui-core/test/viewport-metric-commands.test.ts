import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  setViewportMetricsAtom,
  setViewportScrollAtom,
  setViewportSizeAtom,
  viewportMetricsAtom,
  initializeViewportMetricsAtom,
} from '../src/viewport'
import { viewportSizeOverridesAtom } from '../src/viewport/size-overrides'
import { sheetHiddenRowsBackingAtom, viewportHiddenColsBackingAtom } from '../src/viewport/hidden-state'

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

  test('resizing keeps the bottom and right edges pinned, including fractional browser offsets', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, {
      ...store.getter(viewportMetricsAtom),
      rowCount: 100, colCount: 20, rowHeight: 20, colWidth: 80,
      viewportHeight: 300, viewportWidth: 400, scrollTop: 1699.5, scrollLeft: 1200,
    })
    store.setter(setViewportSizeAtom, { viewportHeight: 260, viewportWidth: 350 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1740, scrollLeft: 1250 })
    store.setter(setViewportSizeAtom, { viewportHeight: 350, viewportWidth: 500 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1650, scrollLeft: 1100 })
  })

  test('edge pinning uses actual row/column sizes and skips hidden trailing indices', () => {
    const store = createStore()
    store.setter(viewportSizeOverridesAtom, {
      rowHeightsBySheet: { s: { '0': 80 } }, colWidthsBySheet: { s: { '0': 240 } },
    })
    store.setter(sheetHiddenRowsBackingAtom, { s: [99] })
    store.setter(viewportHiddenColsBackingAtom, { s: [19] })
    store.setter(setViewportMetricsAtom, {
      ...store.getter(viewportMetricsAtom), sheetId: 's',
      rowCount: 100, colCount: 20, rowHeight: 20, colWidth: 80,
      viewportHeight: 300, viewportWidth: 400, scrollTop: 1740, scrollLeft: 1280,
    })
    store.setter(setViewportSizeAtom, { viewportHeight: 250, viewportWidth: 300 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 1790, scrollLeft: 1380 })
  })

  test('shrinking a fully visible sheet stays at its origin rather than jumping to the new end', () => {
    const store = createStore()
    store.setter(setViewportMetricsAtom, {
      ...store.getter(viewportMetricsAtom), rowCount: 10, colCount: 4,
      viewportHeight: 500, viewportWidth: 600,
    })
    store.setter(setViewportSizeAtom, { viewportHeight: 100, viewportWidth: 100 })
    expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 0, scrollLeft: 0 })
  })
})
