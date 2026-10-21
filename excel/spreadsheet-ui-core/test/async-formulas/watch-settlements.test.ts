import { expect, test, vi } from 'vitest'
import { createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  projectionSnapshotAtom, setRustWorkbookConnectionAtom, startEditingAtom, editingSessionAtom,
  type RustWorkbookConnection, type VisibleProjectionRequest } from '../../src'
import { watchAsyncFormulaSettlementsAtom } from '../../src/async-formulas/watch-settlements'

async function setup() {
  const waiting: ((value: { settled: boolean }) => void)[] = []
  const request = vi.fn(async (command: string, input: { request: VisibleProjectionRequest }) => {
    if (command === 'formula.awaitAsync') return new Promise(resolve => { waiting.push(resolve) })
    return { ...input.request, cells: [{ row: input.request.window.rowStart, col: 0,
      displayValue: '7' }], revision: waiting.length }
  })
  const connection = { request: request as RustWorkbookConnection['request'], dispose() {} }
  const { store } = createSpreadsheetUi({ connection })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
    { id: 'other', name: 'Other', index: 1, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  return { store, connection, request, waiting }
}

test('one deferred command refreshes current scrolled window and preserves the editing draft', async () => {
  const { store, connection, request, waiting } = await setup()
  store.setter(watchAsyncFormulaSettlementsAtom, connection)
  store.setter(watchAsyncFormulaSettlementsAtom, connection)
  await Promise.resolve()
  expect(waiting).toHaveLength(1)
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 20, rowEnd: 29, colStart: 0, colEnd: 7 } })
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 20, col: 0 }, source: 'cell', draft: '=SUM(' })
  waiting[0]({ settled: true })
  await vi.waitFor(() => expect(waiting).toHaveLength(2))
  expect(request.mock.calls.filter(([command]) => command === 'projection.readVisible').at(-1)?.[1])
    .toMatchObject({ request: { sheetId: 's', window: { rowStart: 20 } } })
  expect(store.getter(editingSessionAtom).draft).toBe('=SUM(')
  waiting[1]({ settled: false })
})

test('settlement from replaced connection cannot request or publish into new workbook', async () => {
  const { store, connection, request, waiting } = await setup()
  store.setter(watchAsyncFormulaSettlementsAtom, connection)
  await Promise.resolve()
  store.setter(setRustWorkbookConnectionAtom, null)
  const before = store.getter(projectionSnapshotAtom)
  const count = request.mock.calls.length
  waiting[0]({ settled: true })
  await Promise.resolve(); await Promise.resolve()
  expect(request.mock.calls).toHaveLength(count)
  expect(store.getter(projectionSnapshotAtom)).toBe(before)
})
