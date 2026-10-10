import { createStore, type Store } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  startEditingAtom,
  cancelEditingAtom,
  updateFormulaDraftAtom,
  editingDraftAtom,
  syncFormulaReferenceCaretAtom,
  formulaReferenceCaretAtom,
  formulaReferenceSessionAtom,
  dispatchFormulaInputKeyAtom,
  selectCellAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  setViewportMetricsAtom,
  viewportMetricsAtom,
  DEFAULT_VIEWPORT_METRICS,
} from '../src'
import {
  sheetHiddenRowsBackingAtom,
  viewportHiddenColsBackingAtom,
  viewportFilterHiddenBackingAtom,
} from '../src/viewport/hidden-state'

function setup(draft = '=') {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 2 } })
  store.setter(startEditingAtom, { sheetId: 's', cell: { row: 1, col: 2 }, draft, source: 'cell' })
  store.setter(syncFormulaReferenceCaretAtom, draft.length)
  return store
}
function key(store: Store, keyName: string, shiftKey = false) {
  const caret = store.getter(formulaReferenceCaretAtom)
  return store.setter(dispatchFormulaInputKeyAtom, {
    key: keyName,
    shiftKey,
    start: caret,
    end: caret,
  })
}

test('arrows replace the picked reference and Shift retains its anchor, never the workbook selection', () => {
  const store = setup('=SUM(')
  const before = store.getter(selectionSnapshotAtom)
  expect(key(store, 'ArrowLeft')).toEqual({ handled: true, caret: 7 })
  key(store, 'ArrowDown', true)
  key(store, 'ArrowDown', true)
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B2:B4')
  key(store, 'ArrowUp', true)
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B2:B3')
  key(store, 'ArrowRight')
  expect(store.getter(editingDraftAtom)).toBe('=SUM(C3')
  expect(store.getter(selectionSnapshotAtom)).toEqual(before)
})

test('F2 preserves text navigation through caret and draft changes, then resumes the same reference', () => {
  const store = setup()
  key(store, 'ArrowLeft')
  key(store, 'F2')
  store.setter(syncFormulaReferenceCaretAtom, 1)
  store.setter(updateFormulaDraftAtom, { draft: '=SUM(', caret: 5 })
  expect(key(store, 'ArrowLeft')).toEqual({ handled: false })
  expect(store.getter(formulaReferenceSessionAtom)).toBeNull()
  key(store, 'F2')
  key(store, 'ArrowLeft')
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B2')
  key(store, 'F2')
  key(store, 'F2')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B3')
})

test('a fresh edit clears F2 text-only mode and a selected expression can be replaced by a reference', () => {
  const store = setup()
  key(store, 'F2')
  store.setter(cancelEditingAtom)
  store.setter(startEditingAtom, {
    sheetId: 's',
    cell: { row: 1, col: 2 },
    draft: '=',
    source: 'cell',
  })
  store.setter(syncFormulaReferenceCaretAtom, 1)
  key(store, 'ArrowLeft')
  expect(store.getter(editingDraftAtom)).toBe('=B2')
  store.setter(updateFormulaDraftAtom, { draft: '=SUM(1+2)', caret: 8 })
  store.setter(dispatchFormulaInputKeyAtom, { key: 'F2', start: 5, end: 8 })
  key(store, 'ArrowLeft')
  expect(store.getter(editingDraftAtom)).toBe('=SUM(B2)')
})

test('reference navigation skips manual/filter-hidden axes, clamps at bounds and scrolls its focus', () => {
  const store = setup()
  store.setter(sheetHiddenRowsBackingAtom, { s: [2] })
  store.setter(viewportFilterHiddenBackingAtom, { rowsBySheet: { s: [3] } })
  store.setter(viewportHiddenColsBackingAtom, { s: [3] })
  store.setter(setViewportMetricsAtom, {
    ...DEFAULT_VIEWPORT_METRICS,
    sheetId: 's',
    rowCount: 20,
    colCount: 10,
    viewportHeight: 48,
    viewportWidth: 192,
  })
  key(store, 'ArrowDown')
  key(store, 'ArrowRight')
  expect(store.getter(editingDraftAtom)).toBe('=E5')
  expect(store.getter(viewportMetricsAtom).scrollTop).toBeGreaterThan(0)
  expect(store.getter(viewportMetricsAtom).scrollLeft).toBeGreaterThan(0)
  for (let i = 0; i < 30; i++) key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe('=E20')
  for (let i = 0; i < 30; i++) key(store, 'ArrowLeft')
  expect(store.getter(editingDraftAtom)).toBe('=A20')
})

test('F4 locks survive moving and extending the same keyboard reference', () => {
  const store = setup()
  key(store, 'ArrowLeft')
  key(store, 'F4')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe('=$B$3')
  key(store, 'ArrowDown', true)
  expect(store.getter(editingDraftAtom)).toBe('=$B$3:$B$4')
})

test('completion candidates take arrow keys before reference picking', () => {
  const store = setup('=SU')
  key(store, 'ArrowDown')
  key(store, 'Enter')
  expect(store.getter(editingDraftAtom)).toBe('=SUMIF(')
  key(store, 'ArrowDown')
  expect(store.getter(editingDraftAtom)).toBe('=SUMIF(C3')
})

test.each(['=50%', "='Sheet+", '=SUM("text,', 'plain'])(
  'arrows remain text navigation for %s',
  (draft) => {
    const store = setup(draft)
    expect(key(store, 'ArrowLeft')).toEqual({ handled: false })
    expect(store.getter(editingDraftAtom)).toBe(draft)
  },
)

test.each(['isComposing', 'ctrlKey', 'metaKey', 'altKey'] as const)(
  'does not consume %s navigation',
  (modifier) => {
    const store = setup()
    expect(
      store.setter(dispatchFormulaInputKeyAtom, {
        key: 'ArrowDown',
        start: 1,
        end: 1,
        [modifier]: true,
      }),
    ).toEqual({ handled: false })
    expect(store.getter(editingDraftAtom)).toBe('=')
  },
)
