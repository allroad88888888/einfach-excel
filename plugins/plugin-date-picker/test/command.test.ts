import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  initializeWorkbookDocumentAtom, selectCellAtom, startEditingAtom, editingSessionAtom,
  beginProjectionAtom, resolveProjectionAtom, setRustWorkbookConnectionAtom,
  type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'
import { datePickerStateAtom, runDatePickerAtom } from '../src/core'

function setup(draft = '2026-09-04', displayValue = draft) {
  const store = createStore()
  const request = vi.fn()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', index: 0, name: 'Sheet', rowCount: 100, colCount: 10 },
  ] })
  store.setter(setRustWorkbookConnectionAtom, {
    request: request as RustWorkbookConnection['request'], dispose() {},
  })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  const read = store.setter(beginProjectionAtom, { kind: 'visible-window', sheetId: 's',
    reason: 'test', window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 } })
  if (read.status !== 'started') throw new Error('Expected projection')
  store.setter(resolveProjectionAtom, { request: read.request, result: { ...read.request,
    cells: [{ row: 1, col: 1, displayValue, inputText: draft,
      format: { numberFormat: { kind: 'date' } } }], revision: 1 } })
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, source: 'cell', draft })
  return { store, request }
}
test('picking a date only changes the plugin draft; cancel preserves the workbook', () => {
  const { store, request } = setup()
  expect(store.getter(datePickerStateAtom)).toMatchObject({ visible: true, value: '2026-09-04', valid: true })
  store.setter(runDatePickerAtom, { value: '2024-02-29' })
  expect(store.getter(editingSessionAtom).draft).toBe('2026-09-04')
  expect(store.getter(datePickerStateAtom).value).toBe('2024-02-29')
  store.setter(runDatePickerAtom, 'cancel')
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})
test('invalid dates do not submit and stale calendar choices do not leak into a new session', () => {
  const { store, request } = setup()
  store.setter(runDatePickerAtom, { value: '2023-02-29' })
  expect(store.getter(datePickerStateAtom).valid).toBe(false)
  expect(store.setter(runDatePickerAtom, 'apply')).toBe(false)
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 1 }, source: 'cell', draft: '2025-01-01' })
  expect(store.getter(datePickerStateAtom).value).toBe('2025-01-01')
  expect(request).not.toHaveBeenCalled()
})
test('date-formatted formulas never show a value-replacing calendar', () => {
  const { store } = setup('=TODAY()')
  expect(store.getter(datePickerStateAtom).visible).toBe(false)
})
test('an unchanged numeric serial initializes from the native ISO display without converting it', () => {
  const { store } = setup('45350', '2024-02-28')
  expect(store.getter(datePickerStateAtom)).toMatchObject({ value: '2024-02-28', valid: true })
  expect(store.getter(editingSessionAtom).draft).toBe('45350')
})
