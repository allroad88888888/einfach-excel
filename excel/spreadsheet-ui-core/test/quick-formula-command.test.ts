import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  beginProjectionAtom, cancelEditingAtom, editingSessionAtom, initializeWorkbookDocumentAtom,
  quickFormulaAvailableAtom, quickFormulaFeedbackAtom, runQuickFormulaAtom,
  selectionSnapshotAtom, setSelectionAtom, setRustWorkbookConnectionAtom,
  resolveProjectionAtom, setSheetProtectionAtom, startEditingAtom, type QuickFormula,
} from '../src'
import type { QuickFormulaSuggestion } from '../src/rust-workbook/quick-formula-commands'

const range = { rowStart: 1, rowEnd: 3, colStart: 0, colEnd: 0 }
const suggestion = { target: { row: 4, col: 0 }, input: '=SUM(A2:A4)', revision: 0 }
function setup() {
  const store = createStore()
  const request = vi.fn(async () => suggestion)
  store.setter(setRustWorkbookConnectionAtom, { request, dispose: vi.fn() })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
  ] })
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'range',
    anchor: { row: 1, col: 0 }, focus: { row: 3, col: 0 } })
  const run = (fn: QuickFormula = 'sum') => store.setter(runQuickFormulaAtom, fn)
  return { store, request, run }
}

test.each(['sum', 'average', 'count'] as const)('%s requests one native suggestion and opens the existing formula-bar draft', async (fn) => {
  const { store, request, run } = setup()
  const input = `=${fn.toUpperCase()}(A2:A4)`
  request.mockResolvedValueOnce({ ...suggestion, input })
  expect(await run(fn)).toBe(true)
  expect(request.mock.calls).toEqual([['formula.suggest', { sheetId: 's', range, function: fn }]])
  expect(store.getter(editingSessionAtom)).toMatchObject({ draft: input,
    source: { sheetId: 's', cell: suggestion.target, source: 'formula-bar' } })
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject(suggestion.target)
  store.setter(cancelEditingAtom)
  expect(request).toHaveBeenCalledTimes(1)
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test('native failure is correctable and cannot write or move the selection', async () => {
  const { store, request, run } = setup()
  const before = store.getter(selectionSnapshotAtom)
  request.mockRejectedValueOnce(new Error('The result cell is not empty.'))
  expect(await run()).toBe(false)
  expect(store.getter(quickFormulaFeedbackAtom).error).toMatch(/not empty/)
  expect(store.getter(selectionSnapshotAtom)).toEqual(before)
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(await run()).toBe(true)
})

test('protection blocks the native target, not just the source selection', async () => {
  const { store, run } = setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [range] } })
  expect(await run()).toBe(false)
  expect(store.getter(quickFormulaFeedbackAtom).error).toMatch(/locked/)
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test.each(['selection', 'editing', 'disconnect'] as const)('late reply after %s cannot steal selection or draft', async (change) => {
  const { store, request, run } = setup()
  let finish!: (result: QuickFormulaSuggestion & { revision: number }) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = run()
  expect(store.getter(quickFormulaAvailableAtom)).toBe(false)
  expect(await run()).toBe(false)
  if (change === 'selection') store.setter(setSelectionAtom, { sheetId: 's', kind: 'cell',
    anchor: { row: 8, col: 2 }, focus: { row: 8, col: 2 } })
  if (change === 'editing') store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 0 }, draft: 'mine', source: 'cell' })
  if (change === 'disconnect') store.setter(setRustWorkbookConnectionAtom, null)
  const selection = store.getter(selectionSnapshotAtom)
  const edit = store.getter(editingSessionAtom)
  finish(suggestion)
  expect(await pending).toBe(false)
  expect(store.getter(selectionSnapshotAtom)).toEqual(selection)
  expect(store.getter(editingSessionAtom)).toEqual(edit)
  expect(store.getter(quickFormulaFeedbackAtom).busy).toBe(false)
  expect(request).toHaveBeenCalledTimes(1)
})

test.each([
  { target: { row: 100, col: 0 } }, { target: { row: 1, col: -1 } },
  { input: '=COUNT(A2:A4)' }, { revision: -1 }, { revision: 0.5 },
])('invalid suggestion %j never starts editing', async (patch) => {
  const { store, request, run } = setup()
  request.mockResolvedValueOnce({ ...suggestion, ...patch })
  expect(await run()).toBe(false)
  expect(store.getter(editingSessionAtom).source).toBeNull()
})

test.each([0, 1])('viewport refresh with revision %i allows only a current native suggestion', async (revision) => {
  const { store, request, run } = setup()
  let finish!: (result: typeof suggestion) => void
  request.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
  const pending = run()
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'viewport', window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 7 } })
  if (read.status !== 'started') throw new Error('Expected a projection request')
  store.setter(resolveProjectionAtom, { request: read.request,
    result: { ...read.request, cells: [], revision } })
  finish(suggestion)
  expect(await pending).toBe(revision === 0)
  expect(store.getter(editingSessionAtom).source !== null).toBe(revision === 0)
})
