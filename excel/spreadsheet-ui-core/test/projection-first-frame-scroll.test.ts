import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  initializeWorkbookDocumentAtom, runVisibleProjectionAtom, setSelectionAtom,
  setRustWorkbookConnectionAtom, setViewportMetricsAtom, viewportMetricsAtom,
} from '../src'
import { createTestRustWorkbookConnection } from './support/rust-workbook-connection'

test('the first sheet frame preserves a remembered range whose leading cell is partly clipped', async () => {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 1001, colCount: 16 },
  ] })
  store.setter(setSelectionAtom, { kind: 'range', sheetId: 's',
    anchor: { row: 699, col: 10 }, focus: { row: 700, col: 11 } })
  store.setter(setViewportMetricsAtom, { ...store.getter(viewportMetricsAtom), sheetId: 's',
    rowCount: 1001, colCount: 16, rowHeight: 28, colWidth: 120,
    viewportHeight: 600, viewportWidth: 287, scrollTop: 19106, scrollLeft: 1273 })
  store.setter(setRustWorkbookConnectionAtom, createTestRustWorkbookConnection({
    readVisibleProjection: async request => ({ ...request, cells: [] }),
  }))
  expect(await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 680, rowEnd: 710, colStart: 8, colEnd: 14 } })).toEqual({ status: 'ready' })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 19106, scrollLeft: 1273 })
})
