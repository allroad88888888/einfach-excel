import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  dispatchKeyboardInputAtom, endPointerSelectionAtom, pointerSessionAtom, selectCellAtom,
  selectionRegionsAtom, setMultiRegionSelectionAtom, setSelectionBoundsAtom,
  setWorkspaceActiveSheetAtom, startPointerSelectionAtom, updatePointerSelectionAtom,
  initializeWorkbookDocumentAtom, publishWorkbookSheetAtom,
} from '../../src'
import { MAX_SELECTION_REGIONS } from '../../src/selection'
import { multiRangeSelectionFeedbackAtom } from '../../src/selection/multi-range/pointer-append'
import { selectionStructureFeedbackAtom } from '../../src/toolbar/selection-structure-state'

function setup() {
  const store = createStore()
  store.setter(initializeWorkbookDocumentAtom, { title: 'Book', sheets: [
    { id: 's', name: 'Sheet', index: 0, rowCount: 20, colCount: 20 },
    { id: 'other', name: 'Other', index: 1, rowCount: 20, colCount: 20 },
  ] })
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 1 } })
  return store
}
const start = { sheetId: 's', coord: { row: 4, col: 4 }, append: true } as const
const move = { sheetId: 's', coord: { row: 6, col: 6 } } as const

test('budget rejection retains all existing regions and primary, reports feedback and captures no pointer', () => {
  const store = setup()
  const region = { kind: 'cell' as const, sheetId: 's', anchor: { row: 1, col: 1 }, focus: { row: 1, col: 1 } }
  store.setter(setMultiRegionSelectionAtom, {
    regions: Array.from({ length: MAX_SELECTION_REGIONS }, () => region), primaryIndex: 123,
  })
  const before = store.getter(setMultiRegionSelectionAtom)
  expect(store.setter(startPointerSelectionAtom, start)).toEqual({ status: 'ignored', reason: 'area-limit' })
  expect(store.getter(setMultiRegionSelectionAtom)).toEqual(before)
  expect(store.getter(multiRangeSelectionFeedbackAtom)).toContain('Selection area limit reached')
  expect(store.getter(pointerSessionAtom).status).toBe('idle')
  store.setter(startPointerSelectionAtom, { ...start, append: false })
  expect(store.getter(multiRangeSelectionFeedbackAtom)).toBe('')
  expect(store.getter(selectionRegionsAtom)).toHaveLength(1)
})

test('an existing rectangle can be activated at the limit, but dragging away cannot consume another slot', () => {
  const store = setup()
  store.setter(setMultiRegionSelectionAtom, { regions: Array.from({
    length: MAX_SELECTION_REGIONS,
  }, (_, row) => ({
    kind: 'cell', sheetId: 's', anchor: { row: row % 20, col: 0 }, focus: { row: row % 20, col: 0 },
  })) })
  expect(store.setter(startPointerSelectionAtom, { ...start, coord: { row: 1, col: 0 } }).status).toBe('applied')
  const before = store.getter(setMultiRegionSelectionAtom)
  expect(store.setter(updatePointerSelectionAtom, move)).toEqual({ status: 'ignored', reason: 'area-limit' })
  expect(store.getter(setMultiRegionSelectionAtom)).toEqual(before)
  expect(store.getter(pointerSessionAtom).status).toBe('idle')
})

test('pointercancel keeps the last valid multi-selection and ignores late moves', () => {
  const store = setup()
  store.setter(startPointerSelectionAtom, start)
  store.setter(updatePointerSelectionAtom, move)
  store.setter(endPointerSelectionAtom, true)
  const before = store.getter(selectionRegionsAtom)
  expect(store.setter(updatePointerSelectionAtom, { ...move, coord: { row: 9, col: 9 } }))
    .toEqual({ status: 'ignored', reason: 'inactive' })
  expect(store.getter(selectionRegionsAtom)).toEqual(before)
})

test('Escape ends an active append before clearing non-primary areas', () => {
  const store = setup()
  store.setter(startPointerSelectionAtom, start)
  expect(store.setter(dispatchKeyboardInputAtom, { key: 'Escape' })).toMatchObject({ type: 'selection.clearNonPrimary' })
  expect(store.getter(pointerSessionAtom).status).toBe('idle')
  const before = store.getter(selectionRegionsAtom)
  expect(before).toHaveLength(1)
  expect(store.setter(updatePointerSelectionAtom, move)).toEqual({ status: 'ignored', reason: 'inactive' })
  expect(store.getter(selectionRegionsAtom)).toEqual(before)
})

test('Escape also ends an append that activated the only existing region', () => {
  const store = setup()
  store.setter(startPointerSelectionAtom, { ...start, coord: { row: 1, col: 1 } })
  expect(store.getter(selectionRegionsAtom)).toHaveLength(1)
  store.setter(dispatchKeyboardInputAtom, { key: 'Escape' })
  expect(store.getter(pointerSessionAtom).status).toBe('idle')
  expect(store.setter(updatePointerSelectionAtom, move)).toEqual({ status: 'ignored', reason: 'inactive' })
})

test.each(['selection', 'bounds', 'sheet-aba', 'metadata', 'structure-busy'] as const)(
  '%s changes invalidate append ownership before a late move can write', (change) => {
    const store = setup()
    store.setter(startPointerSelectionAtom, start)
    if (change === 'selection') store.setter(selectCellAtom, { sheetId: 's', coord: { row: 0, col: 0 } })
    if (change === 'bounds') store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
    if (change === 'sheet-aba') {
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'other' })
      store.setter(setWorkspaceActiveSheetAtom, { sheetId: 's' })
    }
    if (change === 'metadata') store.setter(publishWorkbookSheetAtom, {
      id: 's', name: 'Sheet', index: 0, rowCount: 19, colCount: 20,
    })
    if (change === 'structure-busy') store.setter(selectionStructureFeedbackAtom, { busy: true, error: null })
    const before = store.getter(selectionRegionsAtom)
    expect(store.setter(updatePointerSelectionAtom, move)).toEqual({ status: 'ignored', reason: 'selection-changed' })
    expect(store.getter(selectionRegionsAtom)).toEqual(before)
    expect(store.getter(pointerSessionAtom).status).toBe('idle')
    expect(store.setter(updatePointerSelectionAtom, move)).toEqual({ status: 'ignored', reason: 'inactive' })
  },
)

test.each([NaN, Infinity, 1.5])('invalid appended coordinates (%s) do not alter selection', (row) => {
  const store = setup()
  const before = store.getter(selectionRegionsAtom)
  expect(store.setter(startPointerSelectionAtom, { ...start, coord: { row, col: 2 } }))
    .toEqual({ status: 'ignored', reason: 'invalid' })
  expect(store.getter(selectionRegionsAtom)).toEqual(before)
})
