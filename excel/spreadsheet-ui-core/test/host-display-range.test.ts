import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom, readWorkbookDisplayRangeAtom, setRustWorkbookConnectionAtom,
  projectionSnapshotAtom, type RustWorkbookConnection, type VisibleProjectionRequest,
} from '../src'

const range = { rowStart: 10, rowEnd: 12, colStart: 2, colEnd: 3 }
function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 1_048_576, colCount: 16_384 },
  ] })
  const request = vi.fn(async (
    _command: string, { request: projection }: { request: VisibleProjectionRequest },
  ) => ({
    ...projection, cells: [{ row: 10, col: 2, displayValue: '42', format: { bgColor: '#123456' } }],
    revision: 3,
  }))
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  return { store, request }
}
test('reads one bounded native display snapshot without publishing it into the scrolling lane', async () => {
  const { store, request } = setup()
  const before = store.getter(projectionSnapshotAtom)
  const result = await store.setter(readWorkbookDisplayRangeAtom, { sheetId: 's', range })
  expect(result.status).toBe('ok')
  if (result.status !== 'ok') throw new Error(result.error.message)
  expect(result.snapshot.cells[0]).toMatchObject({ displayValue: '42', format: { bgColor: '#123456' } })
  expect(request).toHaveBeenCalledOnce()
  expect(request.mock.calls[0]).toMatchObject(['projection.readVisible', { request: { window: range } }])
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
})
test('oversized and invalid ranges reject before transport', async () => {
  const { store, request } = setup()
  for (const invalid of [{ ...range, rowStart: -1 }, { ...range, rowEnd: 1_048_576 },
    { rowStart: 0, rowEnd: 100_000, colStart: 0, colEnd: 2 }])
    expect(await store.setter(readWorkbookDisplayRangeAtom, { sheetId: 's', range: invalid }))
      .toMatchObject({ status: 'error' })
  expect(request).not.toHaveBeenCalled()
})
test('a detached connection cannot hand an old workbook snapshot to the exporter', async () => {
  const { store, request } = setup()
  let resolve!: (result: Awaited<ReturnType<typeof request>>) => void
  request.mockImplementationOnce(() => new Promise((finish) => { resolve = finish }))
  const pending = store.setter(readWorkbookDisplayRangeAtom, { sheetId: 's', range })
  store.setter(setRustWorkbookConnectionAtom, null)
  resolve({ ...request.mock.calls[0][1].request, cells: [], revision: 3 })
  expect(await pending).toMatchObject({ status: 'error', error: {
    message: expect.stringContaining('workbook changed'),
  } })
})
