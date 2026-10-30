import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  exportWorkbookSnapshotAtom,
  initializeWorkbookDocumentAtom,
  openWorkbookSnapshotAtom,
  setRustWorkbookConnectionAtom,
  type RustWorkbookConnection,
} from '../src'

function setup(request: RustWorkbookConnection['request']) {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 10, colCount: 4 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, { request, dispose() {} })
  return store
}

test('export returns the native file text with the workbook title', async () => {
  const request = vi.fn(async () => ({ text: '{"native":true}', filename: 'Book.einfach.json' }))
  const store = setup(request as unknown as RustWorkbookConnection['request'])
  await expect(store.setter(exportWorkbookSnapshotAtom)).resolves.toEqual({
    status: 'ok', snapshot: '{"native":true}', title: 'Book',
  })
  expect(request).toHaveBeenCalledWith('workbook.exportFile', { title: 'Book' })
})

test('export reports a missing workbook instead of an empty snapshot', async () => {
  const store = createStore()
  const result = await store.setter(exportWorkbookSnapshotAtom)
  expect(result.status).toBe('error')
})

test('opening rejects an empty snapshot without touching the current workbook', async () => {
  const request = vi.fn()
  const store = setup(request as unknown as RustWorkbookConnection['request'])
  const result = await store.setter(openWorkbookSnapshotAtom, '')
  expect(result.status).toBe('error')
  expect(request).not.toHaveBeenCalled()
})
