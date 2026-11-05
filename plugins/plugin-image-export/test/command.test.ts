import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom, selectCellAtom, setRustWorkbookConnectionAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest,
} from '@einfach-excel/spreadsheet-ui-core'
import { configureImageExportAtom, deliverImageExportAtom, imageExportPanelAtom, openImageExportAtom } from '../src/core'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 10 },
  ] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  const request = vi.fn(async (
    _command: string, { request: projection }: { request: VisibleProjectionRequest },
  ) => ({
    ...projection, cells: [{ row: 1, col: 1, displayValue: '42' }], revision: 2,
  }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  return { store, request }
}
test('outputs share the captured snapshot and never mutate or republish the workbook', async () => {
  const { store, request } = setup()
  expect(await store.setter(openImageExportAtom)).toBe(true)
  const write = vi.fn(async () => {})
  store.setter(configureImageExportAtom, { scale: 2 })
  expect(await store.setter(deliverImageExportAtom, write)).toBe(true)
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ revision: 2 }), 2)
  expect(request).toHaveBeenCalledOnce()
  expect(store.getter(imageExportPanelAtom).success).toBe(true)
})
test('output failure leaves a retryable snapshot and double clicks cannot export twice', async () => {
  const { store } = setup()
  await store.setter(openImageExportAtom)
  let reject!: (error: Error) => void
  const write = vi.fn(() => new Promise<void>((_resolve, fail) => { reject = fail }))
  const pending = store.setter(deliverImageExportAtom, write)
  expect(await store.setter(deliverImageExportAtom, write)).toBe(false)
  reject(new Error('Permission denied'))
  expect(await pending).toBe(false)
  expect(store.getter(imageExportPanelAtom)).toMatchObject({ busy: false, error: 'Permission denied' })
  expect(store.getter(imageExportPanelAtom).snapshot).not.toBeNull()
})
