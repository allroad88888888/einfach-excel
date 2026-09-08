import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom,
  setRustWorkbookConnectionAtom,
  runVisibleProjectionAtom,
  runRustHistoryAtom,
  workbookDocumentAtom,
  activeWorkbookSheetAtom,
  selectionSnapshotAtom,
  selectCellAtom,
  rustHistoryPanelAtom,
  projectionSnapshotAtom,
  viewportSizeOverridesAtom,
  runWorkbookSheetCommandAtom,
  type RustWorkbookConnection,
  type RustWorkbookCommands,
} from '../src'
import { activateWorkbookSheetAtom } from '../src/runtime/activate-workbook-sheet'
import { historyProjectionRequest } from '../src/rust-workbook/history-apply'

const orders = { id: 'orders', key: '1', name: 'Orders', index: 0, rowCount: 1001, colCount: 16 }
const summary = { id: 'summary', key: '2', name: 'Summary', index: 1, rowCount: 12, colCount: 2 }
const range = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
async function setup(
  before = [orders, summary],
  after = [summary, orders].map((s, index) => ({ ...s, index })),
  target = orders,
  active = orders,
) {
  const store = createStore()
  const state = {
    undoCount: 1,
    redoCount: 0,
    notice: null,
    entries: [
      {
        label: 'Worksheet operation',
        sheetIndex: target.index,
        sheetKey: target.key,
        sheetChange: true,
        range,
      },
    ],
  }
  const apply = vi.fn(async (input: RustWorkbookCommands['history.apply']['payload']) => ({
    sheetId: target.id,
    sheets: after,
    range: { rowStart: 0, rowEnd: target.rowCount - 1, colStart: 0, colEnd: target.colCount - 1 },
    sizes: { rowHeights: [{ rowIndex: target.rowCount - 1, heightPx: 60 }], colWidths: [] },
    projection: {
      ...historyProjectionRequest(input.projection, after, active.index),
      cells: [],
      revision: 2,
      history: { ...state, undoCount: 0, redoCount: 1 },
    },
  }))
  const request = vi.fn(async (command: string, payload: unknown) =>
    command === 'history.apply'
      ? apply(payload as RustWorkbookCommands['history.apply']['payload'])
      : { ...(payload as { request: object }).request, cells: [], history: state, revision: 1 },
  )
  store.setter(setRustWorkbookConnectionAtom, {
    request,
    dispose() {},
  } as unknown as RustWorkbookConnection)
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: before })
  store.setter(activateWorkbookSheetAtom, active)
  store.setter(selectCellAtom, { sheetId: active.id, coord: { row: 3, col: 1 }, extend: false })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: active.id,
    reason: 'viewport',
    window: {
      rowStart: 2,
      rowEnd: 10,
      colStart: 0,
      colEnd: 1,
    },
  })
  return { store, apply, request }
}

test('move undo updates tab order while preserving the active cell and view', async () => {
  const r = await setup()
  expect(await r.store.setter(runRustHistoryAtom, 'undo')).toBe(true)
  expect(r.store.getter(workbookDocumentAtom).sheets.map((s) => s.id)).toEqual([
    'summary',
    'orders',
  ])
  expect(r.store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
    sheetId: 'orders',
    row: 3,
    col: 1,
  })
  expect(r.apply).toHaveBeenCalledTimes(1)
  expect(r.request, 'initial projection plus one history RPC').toHaveBeenCalledTimes(2)
})

test('undo delete reintroduces a missing sheet using returned identity, bounds and offscreen sizes', async () => {
  const r = await setup([orders], [orders, summary], summary)
  expect(await r.store.setter(runRustHistoryAtom, 'undo')).toBe(true)
  expect(r.store.getter(workbookDocumentAtom).sheets[1]).toEqual(summary)
  expect(r.store.getter(activeWorkbookSheetAtom)?.id).toBe('orders')
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.summary?.['11']).toBe(60)
})

test('undo add removes the active sheet, resets selection, and applies the fallback projection', async () => {
  const second = { ...summary, index: 0 }
  const r = await setup([orders, summary], [second])
  expect(await r.store.setter(runRustHistoryAtom, 'undo')).toBe(true)
  expect(r.store.getter(activeWorkbookSheetAtom)).toEqual(second)
  expect(r.store.getter(selectionSnapshotAtom).activeCell).toMatchObject({
    sheetId: 'summary',
    row: 0,
    col: 0,
  })
  expect(r.store.getter(projectionSnapshotAtom).result?.sheetId).toBe('summary')
  expect(r.store.getter(viewportSizeOverridesAtom).rowHeightsBySheet.orders).toBeUndefined()
})

test('mismatched native identity cannot mutate the document or active sheet', async () => {
  const r = await setup([orders], [orders, { ...summary, key: '99' }], summary)
  const before = r.store.getter(workbookDocumentAtom)
  expect(await r.store.setter(runRustHistoryAtom, 'undo')).toBe(false)
  expect(r.store.getter(workbookDocumentAtom)).toBe(before)
  expect(r.store.getter(rustHistoryPanelAtom).error).toContain('identities')
})

test('pending history blocks sheet mutation and engine failure keeps metadata for retry', async () => {
  const r = await setup()
  let reject!: (error: Error) => void
  r.apply.mockImplementationOnce(
    () =>
      new Promise((_resolve, fail) => {
        reject = fail
      }),
  )
  const before = r.store.getter(workbookDocumentAtom)
  const pending = r.store.setter(runRustHistoryAtom, 'undo')
  expect(await r.store.setter(runWorkbookSheetCommandAtom, { operation: 'move-right' })).toBe(false)
  reject(new Error('Try again'))
  expect(await pending).toBe(false)
  expect(r.store.getter(workbookDocumentAtom)).toBe(before)
  expect(await r.store.setter(runRustHistoryAtom, 'undo')).toBe(true)
})
