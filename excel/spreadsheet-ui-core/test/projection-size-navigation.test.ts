import { atom, createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { initializeWorkbookDocumentAtom, selectCellAtom, setSelectionAtom,
  setViewportMetricsAtom, viewportMetricsAtom, type VisibleProjectionResult } from '../src'
import { applyProjectionSizes } from '../src/projection/projection-sizes'

const apply = atom(null, (get, set, result: VisibleProjectionResult) =>
  applyProjectionSizes(get, set, result))
const result: VisibleProjectionResult = {
  kind: 'visible-window', sheetId: 's', requestId: 1,
  window: { rowStart: 8, rowEnd: 14, colStart: 0, colEnd: 7 },
  cells: [], rowHeights: [{ rowIndex: 10, heightPx: 40 }],
}

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 20 },
  ] })
  store.setter(setViewportMetricsAtom, { sheetId: 's', scrollTop: 140, scrollLeft: 200,
    viewportHeight: 100, viewportWidth: 200, rowHeight: 20, colWidth: 50,
    rowCount: 100, colCount: 20, overscanRows: 2, overscanCols: 2 })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 10, col: 5 }, focus: { row: 11, col: 7 } })
  return store
}

test('native sizes keep the previously visible range and its fill corner visible', () => {
  const store = setup()
  store.setter(apply, { ...result, colWidths: [{ colIndex: 6, widthPx: 80 }] })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 160, scrollLeft: 230 })
  // A second projection of the same sizes must not scroll again.
  store.setter(apply, { ...result, colWidths: [{ colIndex: 6, widthPx: 80 }] })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 160, scrollLeft: 230 })
})

test('a visible single cell stays visible when a preceding row grows', () => {
  const store = setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 11, col: 7 } })
  store.setter(apply, result)
  expect(store.getter(viewportMetricsAtom).scrollTop).toBe(160)
})

test('manual scrolling away from the selection does not pull it back', () => {
  const store = setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 0 } })
  store.setter(apply, result)
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 140, scrollLeft: 200 })
})

test('a result for another sheet cannot move the current viewport', () => {
  const store = setup()
  store.setter(apply, { ...result, sheetId: 'other' })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 140, scrollLeft: 200 })
})

test('an oversized range keeps its active cell rather than chasing the far end', () => {
  const store = setup()
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 99, col: 19 }, focus: { row: 11, col: 7 } })
  store.setter(apply, result)
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ scrollTop: 160, scrollLeft: 200 })
})
