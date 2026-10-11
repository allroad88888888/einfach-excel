import { expect, test, vi } from 'vitest'
import {
  createSpreadsheetUi, initializeWorkbookDocumentAtom, runVisibleProjectionAtom,
  spillAvailableAtom, spillPanelAtom, runSpillAtom, selectionSnapshotAtom, selectCellAtom,
  startEditingAtom, setRustWorkbookConnectionAtom, type RustWorkbookConnection,
  type VisibleProjectionRequest,
} from '../src'
import type { SpillInspection } from '../src/rust-workbook/spill-commands'

const active: SpillInspection = { kind: 'active', anchor: { row: 2, col: 1 },
  range: { rowStart: 2, rowEnd: 8, colStart: 1, colEnd: 2 } }
const blocked: SpillInspection = { kind: 'blocked', anchor: { row: 2, col: 1 },
  blocker: { row: 6, col: 1 } }
async function setup(inspection: SpillInspection = active) {
  const inspect = vi.fn(async () => ({ inspection, revision: 1 }))
  const request = vi.fn(async (command: string, input: unknown) => command === 'formula.inspectSpill'
    ? inspect()
    : { ...(input as { request: VisibleProjectionRequest }).request, cells: [], revision: 1 })
  const { store } = createSpreadsheetUi({ connection: {
    request: request as RustWorkbookConnection['request'], dispose() {},
  } })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  await store.setter(runVisibleProjectionAtom, { sheetId: 's', reason: 'viewport',
    window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 1 } })
  return { store, inspect, request }
}

test.each(['range', 'anchor'] as const)('%s navigation uses one inspection, no data write or second lookup', async (action) => {
  const { store, inspect, request } = await setup()
  expect(await store.setter(runSpillAtom, 'open')).toBe(true)
  expect(request).toHaveBeenLastCalledWith('formula.inspectSpill', { sheetId: 's', cell: { row: 3, col: 1 } })
  expect(await store.setter(runSpillAtom, action)).toBe(true)
  expect(store.getter(selectionSnapshotAtom).range).toEqual(action === 'range' ? active.range
    : { rowStart: 2, rowEnd: 2, colStart: 1, colEnd: 1 })
  expect(store.getter(spillPanelAtom).open).toBe(false)
  expect(inspect).toHaveBeenCalledOnce()
  expect(request).toHaveBeenCalledTimes(2)
})

test('blocker navigation selects the native obstruction, not the anchor', async () => {
  const { store } = await setup(blocked)
  await store.setter(runSpillAtom, 'open')
  expect(await store.setter(runSpillAtom, 'blocker')).toBe(true)
  expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 6, col: 1 })
})

test.each([{ kind: 'none' }, { ...blocked, blocker: null }] as SpillInspection[])(
  'no fabricated navigation for $kind without a target', async (inspection) => {
    const { store } = await setup(inspection)
    const before = store.getter(selectionSnapshotAtom)
    await store.setter(runSpillAtom, 'open')
    expect(await store.setter(runSpillAtom, 'blocker')).toBe(false)
    expect(await store.setter(runSpillAtom, 'range')).toBe(false)
    expect(store.getter(selectionSnapshotAtom)).toBe(before)
  },
)

test('editing and synchronous reentry cannot start a query', async () => {
  const { store, inspect } = await setup()
  const pending = store.setter(runSpillAtom, 'open')
  expect(store.getter(spillAvailableAtom)).toBe(false)
  expect(await store.setter(runSpillAtom, 'open')).toBe(false)
  await pending
  store.setter(runSpillAtom, 'close')
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: '=SUM(' })
  expect(await store.setter(runSpillAtom, 'open')).toBe(false)
  expect(inspect).toHaveBeenCalledOnce()
})

test.each(['move', 'close', 'disconnect'] as const)('late reply after %s cannot navigate or reopen', async (action) => {
  const { store, inspect } = await setup()
  let resolve!: (result: { inspection: SpillInspection; revision: number }) => void
  inspect.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const pending = store.setter(runSpillAtom, 'open')
  if (action === 'move') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 4 } })
  if (action === 'close') await store.setter(runSpillAtom, 'close')
  if (action === 'disconnect') store.setter(setRustWorkbookConnectionAtom, null)
  const before = store.getter(selectionSnapshotAtom)
  resolve({ inspection: active, revision: 1 })
  expect(await pending).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
  expect(store.getter(spillPanelAtom).busy).toBe(false)
  if (action !== 'move') expect(store.getter(spillPanelAtom).open).toBe(false)
})

test('an old reply after close/reopen does not replace the new inspection', async () => {
  const { store, inspect } = await setup(blocked)
  let resolve!: (result: { inspection: SpillInspection; revision: number }) => void
  inspect.mockImplementationOnce(() => new Promise((done) => { resolve = done }))
  const first = store.setter(runSpillAtom, 'open')
  await store.setter(runSpillAtom, 'close')
  await store.setter(runSpillAtom, 'open')
  resolve({ inspection: active, revision: 1 })
  expect(await first).toBe(false)
  expect(store.getter(spillPanelAtom).inspection).toEqual(blocked)
})

test('changed selection requires refresh; a native error can be retried', async () => {
  const { store, inspect } = await setup()
  await store.setter(runSpillAtom, 'open')
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 50, col: 4 } })
  expect(store.getter(spillPanelAtom).stale).toBe(true)
  expect(await store.setter(runSpillAtom, 'range')).toBe(false)
  inspect.mockRejectedValueOnce(new Error('Native failure'))
  expect(await store.setter(runSpillAtom, 'refresh')).toBe(false)
  expect(store.getter(spillPanelAtom).error).toBe('Native failure')
  expect(await store.setter(runSpillAtom, 'refresh')).toBe(true)
  expect(store.getter(spillPanelAtom).stale).toBe(false)
})

test('outside-canvas spill is described but never silently clamped', async () => {
  const { store } = await setup({ ...active, range: { ...active.range, rowEnd: 101 } })
  await store.setter(runSpillAtom, 'open')
  const before = store.getter(selectionSnapshotAtom)
  expect(await store.setter(runSpillAtom, 'range')).toBe(false)
  expect(store.getter(spillPanelAtom).error).toContain('outside')
  expect(store.getter(selectionSnapshotAtom)).toBe(before)
})
