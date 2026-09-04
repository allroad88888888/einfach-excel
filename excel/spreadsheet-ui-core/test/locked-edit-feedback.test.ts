import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  clearLockedEditFeedbackForCellAtom,
  dismissLockedEditFeedbackAtom,
  lockedEditFeedbackAtom,
  reportLockedEditFeedbackAtom,
  setWorkspaceActiveSheetAtom,
} from '../src'

describe('locked direct-edit feedback', () => {
  test('snapshots a valid active-sheet rejection without retaining caller cell state', () => {
    const store = createStore()
    const cell = { row: 2, col: 3 }
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })

    const reported = store.setter(reportLockedEditFeedbackAtom, {
      sheetId: 'sheet-a',
      cell,
      source: 'cell',
    })
    cell.row = 99

    expect(reported).toMatchObject({ id: 1, sheetId: 'sheet-a', cell: { row: 2, col: 3 } })
    expect(store.getter(lockedEditFeedbackAtom)).toMatchObject({
      id: 1,
      sheetId: 'sheet-a',
      cell: { row: 2, col: 3 },
      source: 'cell',
    })
  })

  test('rejects invalid or inactive-sheet reports', () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })

    expect(
      store.setter(reportLockedEditFeedbackAtom, {
        sheetId: 'sheet-b',
        cell: { row: 0, col: 0 },
        source: 'keyboard',
      }),
    ).toBeNull()
    expect(
      store.setter(reportLockedEditFeedbackAtom, {
        sheetId: 'sheet-a',
        cell: { row: -1, col: 0 },
        source: 'keyboard',
      }),
    ).toBeNull()
    expect(store.getter(lockedEditFeedbackAtom)).toBeNull()
  })

  test('keeps an A → B → A rejection stale and prevents its dismissal from clearing B', () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
    const first = store.setter(reportLockedEditFeedbackAtom, {
      sheetId: 'sheet-a',
      cell: { row: 0, col: 0 },
      source: 'cell',
    })
    if (!first) throw new Error('Expected initial locked feedback')

    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-b' })
    expect(store.getter(lockedEditFeedbackAtom)).toBeNull()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
    expect(store.getter(lockedEditFeedbackAtom)).toBeNull()

    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-b' })
    const second = store.setter(reportLockedEditFeedbackAtom, {
      sheetId: 'sheet-b',
      cell: { row: 1, col: 1 },
      source: 'keyboard',
    })
    if (!second) throw new Error('Expected current locked feedback')
    store.setter(dismissLockedEditFeedbackAtom, first)

    expect(store.getter(lockedEditFeedbackAtom)).toBe(second)
  })

  test('clears only the visible feedback for its exact cell', () => {
    const store = createStore()
    store.setter(setWorkspaceActiveSheetAtom, { sheetId: 'sheet-a' })
    store.setter(reportLockedEditFeedbackAtom, {
      sheetId: 'sheet-a',
      cell: { row: 4, col: 5 },
      source: 'keyboard',
    })

    store.setter(clearLockedEditFeedbackForCellAtom, {
      sheetId: 'sheet-a',
      cell: { row: 4, col: 6 },
    })
    expect(store.getter(lockedEditFeedbackAtom)).not.toBeNull()
    store.setter(clearLockedEditFeedbackForCellAtom, {
      sheetId: 'sheet-b',
      cell: { row: 4, col: 5 },
    })
    expect(store.getter(lockedEditFeedbackAtom)).not.toBeNull()
    store.setter(clearLockedEditFeedbackForCellAtom, {
      sheetId: 'sheet-a',
      cell: { row: 4, col: 5 },
    })

    expect(store.getter(lockedEditFeedbackAtom)).toBeNull()
  })
})
