import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import { initializeWorkbookDocumentAtom, setRustWorkbookConnectionAtom,
  activeWorkbookSheetAtom, showFormulasAtom, toggleFormulaViewAtom, formulaViewText,
  startEditingAtom, cancelEditingAtom } from '../src'
import { activateWorkbookSheetAtom } from '../src/runtime/activate-workbook-sheet'

function setup() {
  const store = createStore()
  const request = vi.fn()
  store.setter(setRustWorkbookConnectionAtom, { request, dispose() {} })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 100, colCount: 8 },
    { id: 't', name: 'Other', index: 1, rowCount: 100, colCount: 8 },
  ] })
  return { store, request }
}
test('per-sheet toggle retains no workbook data and resets on replacement connection', () => {
  const { store, request } = setup()
  const first = store.getter(activeWorkbookSheetAtom)!
  store.setter(toggleFormulaViewAtom)
  expect(store.getter(showFormulasAtom)).toBe(true)
  store.setter(activateWorkbookSheetAtom, { id: 't', name: 'Other', index: 1, rowCount: 100, colCount: 8 })
  expect(store.getter(showFormulasAtom)).toBe(false)
  store.setter(activateWorkbookSheetAtom, first)
  expect(store.getter(showFormulasAtom)).toBe(true)
  store.setter(setRustWorkbookConnectionAtom, { request, dispose() {} })
  expect(store.getter(showFormulasAtom)).toBe(false)
  expect(request).not.toHaveBeenCalled()
})
test('toggle never disturbs a draft and uses formula metadata, not text starting with equals', () => {
  const { store } = setup()
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 0, col: 0 }, source: 'cell', draft: 'mine' })
  store.setter(toggleFormulaViewAtom)
  expect(store.getter(showFormulasAtom)).toBe(false)
  store.setter(cancelEditingAtom)
  store.setter(toggleFormulaViewAtom)
  const cell = { row: 0, col: 0, displayValue: '50%', formula: '=1/2' }
  expect(formulaViewText(cell, true)).toBe('=1/2')
  expect(formulaViewText(cell, false)).toBe('50%')
  expect(formulaViewText({ row: 0, col: 0, inputText: "'=not a formula", displayValue: '=not a formula' }, true)).toBe('=not a formula')
  expect(formulaViewText(undefined, true)).toBe('')
})
