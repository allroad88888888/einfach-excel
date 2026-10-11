import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import { initializeWorkbookDocumentAtom, runInsertFunctionAtom, insertFunctionPanelAtom,
  editingSessionAtom, setSelectionAtom, setRustWorkbookConnectionAtom, startEditingAtom,
  setSheetProtectionAtom } from '../src'
import { installTestFunctionCatalog, TEST_FUNCTION_CATALOG } from './support/function-catalog'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet1', rowCount: 100, colCount: 10 },
  ] })
  const native = installTestFunctionCatalog(store, { version: 1, functions: [
    ...TEST_FUNCTION_CATALOG.functions,
    { name: 'XLOOKUP', category: 'Lookup & reference', note: null },
  ] })
  const run = (action: Parameters<typeof runInsertFunctionAtom.write>[2]) =>
    store.setter(runInsertFunctionAtom, action)
  return { store, run, ...native }
}

test('search and category intersect, empty results cannot insert, cancel never writes', () => {
  const { store, run, request } = setup()
  expect(run('open')).toBe(true)
  run({ query: 'xloo' })
  expect(store.getter(insertFunctionPanelAtom).functions.map((entry) => entry.name)).toEqual(['XLOOKUP'])
  run({ category: 'Test' })
  expect(store.getter(insertFunctionPanelAtom).functions).toEqual([])
  expect(run('insert')).toBe(false)
  run('close')
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('insertion creates a formula-bar draft on the active cell without a native write', () => {
  const { store, run, request } = setup()
  run('open')
  run({ name: 'XLOOKUP' })
  expect(run('insert')).toBe(true)
  expect(store.getter(insertFunctionPanelAtom).open).toBe(false)
  expect(store.getter(editingSessionAtom)).toMatchObject({ draft: '=XLOOKUP(', source: {
    sheetId: 's', cell: { row: 0, col: 0 }, source: 'formula-bar',
  } })
  expect(request).not.toHaveBeenCalled()
})

test('exact search matches precede prefix and substring matches', () => {
  const { store, run } = setup()
  run('open')
  run({ query: 'sum' })
  expect(store.getter(insertFunctionPanelAtom).selected?.name).toBe('SUM')
  expect(store.getter(insertFunctionPanelAtom).functions.map((entry) => entry.name)).toEqual(['SUM', 'SUMIF'])
})

test('changing the selection or connection invalidates an open picker', () => {
  const { store, run } = setup()
  run('open')
  store.setter(setSelectionAtom, { sheetId: 's', kind: 'cell', anchor: { row: 2, col: 2 }, focus: { row: 2, col: 2 } })
  expect(store.getter(insertFunctionPanelAtom).open).toBe(false)
  expect(run('insert')).toBe(false)
  run('open')
  store.setter(setRustWorkbookConnectionAtom, null)
  expect(store.getter(insertFunctionPanelAtom).available).toBe(false)
})

test('existing drafts are never overwritten by the picker', () => {
  const { store, run } = setup()
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: 'keep me' })
  expect(run('open')).toBe(false)
  expect(store.getter(editingSessionAtom).draft).toBe('keep me')
})

test('locked active cells report the existing mutation diagnostic instead of starting a draft', () => {
  const { store, run } = setup()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  run('open')
  expect(run('insert')).toBe(false)
  expect(store.getter(insertFunctionPanelAtom).error).not.toBe('')
  expect(store.getter(editingSessionAtom).source).toBeNull()
})
