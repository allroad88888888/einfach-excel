import { createStore } from '@einfach/core'
import { expect, test, vi } from 'vitest'
import {
  activeWorkbookSheetAtom, goToErrorMessageAtom, goToHistoryAtom, goToInputAtom, goToOpenAtom,
  initializeWorkbookDocumentAtom, runGoToReferenceAtom, selectionSnapshotAtom,
  setRustWorkbookConnectionAtom, setViewportMetricsAtom, viewportMetricsAtom,
  startEditingAtom, cancelEditingAtom, parseGoToReference,
} from '../src'
import { publishWorkbookSheetAtom } from '../src/runtime/workbook-document'
import { activateWorkbookSheetAtom } from '../src/runtime/activate-workbook-sheet'
import { sheetTabsAtom } from '../src/sheet-tabs/state'
import { sheetHiddenRowsBackingAtom } from '../src/viewport/hidden-state'
import type { GoToReferenceAction } from '../src/go-to/reference-command'

const sheets = [
  { id: 'orders', name: 'Sales Orders', index: 0, rowCount: 1001, colCount: 26 },
  { id: 'summary', name: "Manager'!s report", index: 1, rowCount: 100, colCount: 8 },
]
function setup() {
  const store = createStore()
  const request = vi.fn()
  store.setter(setRustWorkbookConnectionAtom, { request, dispose: vi.fn() })
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets })
  store.setter(setViewportMetricsAtom, {
    ...store.getter(viewportMetricsAtom), sheetId: 'orders', rowCount: 1001, colCount: 26,
    rowHeight: 28, colWidth: 120, viewportHeight: 400, viewportWidth: 480,
  })
  const run = (action: GoToReferenceAction) => store.setter(runGoToReferenceAtom, action)
  const go = (input: string) => { run('open'); run({ input }); return run('submit') }
  return { store, request, run, go }
}

test.each([
  ['B12', { rowStart: 11, rowEnd: 11, colStart: 1, colEnd: 1 }],
  ['$D$18:$B$12', { rowStart: 11, rowEnd: 17, colStart: 1, colEnd: 3 }],
  ['R12C3:R18C5', { rowStart: 11, rowEnd: 17, colStart: 2, colEnd: 4 }],
])('navigates %s through selection without workbook writes', (input, range) => {
  const { store, request, go } = setup()
  expect(go(input)).toBe(true)
  expect(store.getter(selectionSnapshotAtom).range).toEqual(range)
  expect(store.getter(goToOpenAtom)).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test('relative R1C1 history is absolute and sheet-qualified instead of drifting on reuse', () => {
  const { store, run, go } = setup()
  go('B5')
  expect(go('R[2]C[3]')).toBe(true)
  expect(store.getter(goToHistoryAtom)[0]).toBe("'Sales Orders'!E7")
  go('A40')
  run('open')
  expect(run({ recent: "'Sales Orders'!E7" })).toBe(true)
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 6, col: 4 })
})

test('cross-sheet jump sets target bounds and preserves the source view', () => {
  const { store, go, request } = setup()
  go('Z990')
  const position = store.getter(viewportMetricsAtom)
  expect(go("'Manager''!s report'!G90:H100")).toBe(true)
  expect(store.getter(activeWorkbookSheetAtom)?.id).toBe('summary')
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 89, rowEnd: 99, colStart: 6, colEnd: 7,
  })
  expect(store.getter(viewportMetricsAtom)).toMatchObject({ sheetId: 'summary', rowCount: 100, colCount: 8 })
  expect(store.getter(viewportMetricsAtom).scrollTop).toBeGreaterThan(0)
  store.setter(activateWorkbookSheetAtom, sheets[0]!)
  expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 989, col: 25 })
  expect(store.getter(viewportMetricsAtom)).toEqual(position)
  expect(request).not.toHaveBeenCalled()
})

test.each(['', 'A0', 'XFE1', 'R[-1]C', 'AA1', 'A1002', "'Manager''!s report'!I1", 'Absent!B2', '$$A1'])(
  'invalid or out-of-canvas reference %s leaves sheet, selection, scroll and history intact', (input) => {
    const { store, go } = setup()
    const before = store.getter(selectionSnapshotAtom)
    const scroll = store.getter(viewportMetricsAtom)
    expect(go(input)).toBe(false)
    expect(store.getter(goToErrorMessageAtom)).toBeTruthy()
    expect(store.getter(goToOpenAtom)).toBe(true)
    expect(store.getter(selectionSnapshotAtom)).toEqual(before)
    expect(store.getter(viewportMetricsAtom)).toEqual(scroll)
    expect(store.getter(goToHistoryAtom)).toEqual([])
  },
)

test('history deduplicates, caps at ten and cannot execute a forged recent entry', () => {
  const { store, run, go } = setup()
  for (let row = 1; row <= 12; row += 1) expect(go(`A${row}`)).toBe(true)
  expect(store.getter(goToHistoryAtom)).toHaveLength(10)
  go('a5')
  const history = store.getter(goToHistoryAtom)
  expect(history[0]).toBe("'Sales Orders'!A5")
  expect(history.filter((entry) => entry.endsWith('!A5'))).toHaveLength(1)
  run('open')
  expect(run({ recent: 'B22' })).toBe(false)
  expect(store.getter(selectionSnapshotAtom).activeCell.row).toBe(4)
})

test('renamed or deleted-sheet addresses fail visibly instead of falling back to active sheet', () => {
  const { store, run, go } = setup()
  go("'Manager''!s report'!B2")
  const recent = store.getter(goToHistoryAtom)[0]!
  store.setter(publishWorkbookSheetAtom, { ...sheets[1]!, name: 'Renamed' })
  run('open')
  expect(run({ recent })).toBe(false)
  expect(store.getter(goToOpenAtom)).toBe(true)
  expect(store.getter(goToHistoryAtom)[0]).toBe(recent)
})

test('editing, disconnected runtime and structural mutations block navigation without committing drafts', () => {
  const { store, run, request } = setup()
  store.setter(startEditingAtom, { sheetId: 'orders', cell: { row: 0, col: 0 }, source: 'cell', draft: 'draft' })
  expect(run('open')).toBe(false)
  store.setter(cancelEditingAtom)
  run('open')
  run({ input: 'B2' })
  const state = store.getter(sheetTabsAtom)
  store.setter(sheetTabsAtom, { ...state, mutation: {
    kind: 'rename', phase: 'pending', requestId: 1, sessionId: state.sessionId,
    sheetId: 'orders', activeSheetIdAtDispatch: 'orders',
  } })
  expect(run('submit')).toBe(false)
  expect(run('close')).toBe(true)
  store.setter(sheetTabsAtom, state)
  store.setter(setRustWorkbookConnectionAtom, null)
  expect(run('open')).toBe(false)
  expect(request).not.toHaveBeenCalled()
})

test('cancel discards draft/error, hidden targets remain hidden and independent stores have separate history', () => {
  const first = setup()
  first.go('invalid')
  first.run('close')
  first.run('open')
  expect(first.store.getter(goToInputAtom)).toBe('')
  expect(first.store.getter(goToErrorMessageAtom)).toBeNull()
  first.store.setter(sheetHiddenRowsBackingAtom, { orders: [8] })
  first.go('B9')
  expect(first.store.getter(sheetHiddenRowsBackingAtom)).toEqual({ orders: [8] })
  const second = setup()
  expect(second.store.getter(goToHistoryAtom)).toEqual([])
})

test('quoted sheet parser preserves escaped apostrophes followed by exclamation marks', () => {
  const context = { sheets, registry: [], activeSheetId: 'orders' }
  expect(parseGoToReference("'Manager''!s report'!$B$2", context)).toEqual({
    ok: true, target: { sheetId: 'summary', coord: { row: 1, col: 1 } },
  })
  expect(parseGoToReference("'Manager'!s report'!B2", context).ok).toBe(false)
})
