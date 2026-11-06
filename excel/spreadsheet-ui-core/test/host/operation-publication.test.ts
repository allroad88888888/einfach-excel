import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { initializeWorkbookDocumentAtom, setRustWorkbookConnectionAtom,
  activeWorkbookSheetAtom, viewportMetricsAtom,
  executeWorkbookOperationAtom, setViewportRowHeightAtom, viewportSizeOverridesAtom,
  type RustWorkbookConnection, type NativeWorkbookOperationResult } from '../../src'
import { activateWorkbookSheetAtom } from '../../src/runtime/activate-workbook-sheet'

const sheets = ['a', 'b'].map((id, index) => ({ id, index, name: id, rowCount: 100, colCount: 10 }))
const range = { rowStart: 20, rowEnd: 20, colStart: 0, colEnd: 0 }
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets })
  let finish!: (result: NativeWorkbookOperationResult) => void
  const request = () => new Promise<NativeWorkbookOperationResult>(resolve => { finish = resolve })
  store.setter(setRustWorkbookConnectionAtom, { request: request as RustWorkbookConnection['request'],
    dispose() {} })
  const pending = store.setter(executeWorkbookOperationAtom,
    { type: 'resize', sheetId: 'a', range, axis: 'row', pixels: 40 })
  return { store, pending, finish: (result: NativeWorkbookOperationResult) => finish(result) }
}

test('late host results preserve navigation made while the worker was pending', async () => {
  const r = setup()
  r.store.setter(activateWorkbookSheetAtom, sheets[1])
  r.finish({ changed: true, revision: 2, sheets })
  expect(await r.pending).toMatchObject({ status: 'ok' })
  expect(r.store.getter(activeWorkbookSheetAtom)?.id).toBe('b')
  expect(r.store.getter(viewportMetricsAtom).sheetId).toBe('b')
})

test('returned geometry updates its range without forgetting another sheet or offscreen sizes', async () => {
  const r = setup()
  for (const sheetId of ['a', 'b'])
    r.store.setter(setViewportRowHeightAtom, { sheetId, rowIndex: 80, heightPx: 70 })
  r.finish({ changed: true, revision: 2, sheets, geometry: { sheetId: 'a', range,
    rowHeights: [{ rowIndex: 20, heightPx: 40 }], colWidths: [] } })
  expect(await r.pending).toMatchObject({ status: 'ok' })
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet)
    .toEqual({ a: { 20: 40, 80: 70 }, b: { 80: 70 } })
})

test('replaced workbook rejects old operation metadata before publication', async () => {
  const r = setup()
  r.store.setter(setRustWorkbookConnectionAtom, null)
  r.finish({ changed: true, revision: 2, sheets: [{ ...sheets[0], name: 'Stale' }] })
  expect(await r.pending).toMatchObject({ status: 'error', error: {
    code: 'WORKBOOK_CONNECTION_REPLACED', commitStatus: 'unknown',
  } })
  expect(r.store.getter(activeWorkbookSheetAtom)?.name).toBe('a')
})
