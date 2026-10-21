import { expect, test } from 'vitest'
import { cancelEditingAtom, editingSessionAtom, hydrateCustomFormulaDefinitionsAtom, selectCellAtom,
  setRustWorkbookConnectionAtom, setSheetProtectionAtom, startEditingAtom } from '../../src'
import { formulaArgumentsPanelAtom } from '../../src/formula-arguments'
import { setupArguments } from './fixtures'
import { nativeTableFeedbackBackingAtom } from '../../src/tables/native-feedback'
import { activateWorkbookSheetAtom } from '../../src/runtime/activate-workbook-sheet'
import { workbookDocumentAtom } from '../../src/runtime/workbook-document'

test('groups insert before the fixed suffix and removing a middle group keeps its remaining values', () => {
  const { store, run, request } = setupArguments()
  expect(run({ open: 'LET' })).toBe(true)
  for (const [field, value] of ['x', '2', 'x*3'].entries()) run({ field, value })
  run('add-group')
  run({ field: 2, value: 'y' }); run({ field: 3, value: '4' })
  run('add-group')
  run({ field: 4, value: 'z' }); run({ field: 5, value: '5' })
  expect(store.getter(formulaArgumentsPanelAtom).fields.map((field) => field.value))
    .toEqual(['x', '2', 'y', '4', 'z', '5', 'x*3'])
  run({ removeGroup: 1 })
  expect(store.getter(formulaArgumentsPanelAtom).fields.map((field) => field.value))
    .toEqual(['x', '2', 'z', '5', 'x*3'])
  expect(run('confirm')).toBe(true)
  expect(store.getter(editingSessionAtom)).toMatchObject({ draft: '=LET(x,2,z,5,x*3)',
    source: { sheetId: 's', cell: { row: 0, col: 0 }, source: 'formula-bar' } })
  expect(run('confirm')).toBe(false)
  expect(store.getter(formulaArgumentsPanelAtom).open).toBe(false)
  store.setter(cancelEditingAtom)
  expect(request).not.toHaveBeenCalled()
})

test('validation keeps the exact field values, and switching or cancelling never sends a request', () => {
  const { store, run, request } = setupArguments()
  run({ open: 'LET' }); run({ field: 0, value: 'x' })
  expect(run('confirm')).toBe(false)
  expect(store.getter(formulaArgumentsPanelAtom)).toMatchObject({ open: true, errorField: 1 })
  expect(store.getter(formulaArgumentsPanelAtom).fields[0].value).toBe('x')
  run({ open: 'IF' })
  expect(store.getter(formulaArgumentsPanelAtom).fields.every((field) => field.value === '')).toBe(true)
  run('close')
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('zero-argument calls, optional repeated groups and native custom definitions share the same path', () => {
  const { store, run, connection, request } = setupArguments()
  run({ open: 'PI' }); expect(run('confirm')).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('=PI()')
  store.setter(cancelEditingAtom)
  run({ open: 'SUM' }); expect(run({ removeGroup: 0 })).toBe(true)
  expect(store.getter(formulaArgumentsPanelAtom).groupCount).toBe(0)
  expect(run('confirm')).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('=SUM()')
  store.setter(cancelEditingAtom)
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [
    { name: 'ORDER_NET', parameters: ['QUANTITY', 'PRICE'], expression: '=QUANTITY*PRICE' },
  ] })
  run({ open: 'ORDER_NET' }); run({ field: 0, value: 'A1' }); run({ field: 1, value: 'B1' })
  expect(run('confirm')).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('=ORDER_NET(A1,B1)')
  expect(request).not.toHaveBeenCalled()
})

test.each(['selection', 'connection', 'editing', 'catalog'] as const)(
  'a stale %s cannot retarget or replace another editing draft', (change) => {
    const { store, run, connection, request } = setupArguments()
    run({ open: 'PI' })
    if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 3, col: 2 } })
    if (change === 'connection') store.setter(setRustWorkbookConnectionAtom, null)
    if (change === 'editing') store.setter(startEditingAtom, {
      sheetId: 's', cell: { row: 0, col: 0 }, draft: 'mine', source: 'cell',
    })
    if (change === 'catalog') store.setter(setRustWorkbookConnectionAtom, { ...connection })
    const before = store.getter(editingSessionAtom)
    expect(run('confirm')).toBe(false)
    expect(store.getter(editingSessionAtom)).toEqual(before)
    expect(request).not.toHaveBeenCalled()
  },
)

test('permission is rechecked at confirmation and blocked drafts remain correctable', () => {
  const { store, run, request } = setupArguments()
  run({ open: 'PI' })
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'protected', unlockedRanges: [] } })
  expect(run('confirm')).toBe(false)
  expect(store.getter(formulaArgumentsPanelAtom)).toMatchObject({ open: true, error: expect.stringContaining('locked') })
  expect(store.getter(editingSessionAtom).source).toBeNull()
  store.setter(setSheetProtectionAtom, { sheetId: 's', state: { mode: 'open', unlockedRanges: [] } })
  expect(run('confirm')).toBe(true)
  expect(request).not.toHaveBeenCalled()
})

test('invalid actions and legacy unavailable metadata cannot create drafts', () => {
  const { run } = setupArguments({ version: 1, functions: [{ name: 'MAP', category: 'Array' }] })
  expect(run({ open: 'MAP' })).toBe(false)
  expect(run({ open: 'UNKNOWN' })).toBe(false)
  expect(run({ field: -1, value: '1' })).toBe(false)
  expect(run('add-group')).toBe(false)
})

test('an in-flight native table command disables edits and confirmation without losing the field draft', () => {
  const { store, connection, run, request } = setupArguments()
  run({ open: 'SUM' }); run({ field: 0, value: '7' })
  store.setter(nativeTableFeedbackBackingAtom, { connection, busy: true, error: null })
  expect(store.getter(formulaArgumentsPanelAtom)).toMatchObject({ open: true, busy: true })
  expect(run({ field: 0, value: '9' })).toBe(false)
  expect(run('add-group')).toBe(false); expect(run('confirm')).toBe(false)
  expect(store.getter(formulaArgumentsPanelAtom).fields[0].value).toBe('7')
  store.setter(nativeTableFeedbackBackingAtom, { connection, busy: false, error: null })
  expect(run('confirm')).toBe(true)
  expect(store.getter(editingSessionAtom).draft).toBe('=SUM(7)')
  expect(request).not.toHaveBeenCalled()
})

test('switching worksheets invalidates the captured target even after returning to the original sheet', () => {
  const { store, run, request } = setupArguments()
  run({ open: 'PI' })
  const sheets = store.getter(workbookDocumentAtom).sheets
  store.setter(activateWorkbookSheetAtom, sheets[1])
  expect(run('confirm')).toBe(false)
  store.setter(activateWorkbookSheetAtom, sheets[0])
  expect(run('confirm')).toBe(false)
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})

test('a changed native custom signature invalidates an existing form on the same connection', () => {
  const { store, connection, run, request } = setupArguments()
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [
    { name: 'ORDER_NET', parameters: ['QUANTITY', 'PRICE'], expression: '=QUANTITY*PRICE' },
  ] })
  run({ open: 'ORDER_NET' }); run({ field: 0, value: 'E3' })
  store.setter(hydrateCustomFormulaDefinitionsAtom, { connection, definitions: [
    { name: 'ORDER_NET', parameters: ['QUANTITY'], expression: '=QUANTITY*2' },
  ] })
  expect(store.getter(formulaArgumentsPanelAtom).open).toBe(false)
  expect(run('confirm')).toBe(false)
  expect(store.getter(editingSessionAtom).source).toBeNull()
  expect(request).not.toHaveBeenCalled()
})
