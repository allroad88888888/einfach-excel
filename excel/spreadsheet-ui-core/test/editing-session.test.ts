import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'

import {
  cancelEditingAtom,
  editingSessionAtom,
  startEditingAtom,
  updateEditingDraftState,
  type EditingSessionState,
  type EditingStartInput,
} from '../src/editing'

describe('editing session', () => {
  test('starts from a cell source and keeps a bounded session only', () => {
    const store = createStore()
    const input: EditingStartInput = {
      sheetId: 'sheet-1',
      cell: { row: 2, col: 3 },
      draft: '=A1+1',
      source: 'cell',
    }

    store.setter(startEditingAtom, input)

    expect(store.getter(editingSessionAtom)).toEqual({
      status: 'drafting',
      source: {
        sheetId: 'sheet-1',
        cell: { row: 2, col: 3 },
        source: 'cell',
      },
      draft: '=A1+1',
    })
  })

  test('updates draft from formula bar and paste without widening the session', () => {
    const state: EditingSessionState = {
      status: 'drafting',
      source: {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 1 },
        source: 'formula-bar',
      },
      draft: '=SUM(A1:A3)',
    }

    const afterFormulaBar = updateEditingDraftState(state, {
      draft: '=SUM(A1:A3)+1',
      source: 'formula-bar',
    })
    const afterPaste = updateEditingDraftState(afterFormulaBar, {
      draft: '42',
      source: 'paste',
    })

    expect(afterFormulaBar).toMatchObject({
      status: 'drafting',
      draft: '=SUM(A1:A3)+1',
      source: {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 1 },
        source: 'formula-bar',
      },
    })
    expect(afterPaste).toMatchObject({
      draft: '42',
      source: {
        sheetId: 'sheet-1',
        cell: { row: 1, col: 1 },
        source: 'paste',
      },
    })
  })

  test('cancels an active session back to idle', () => {
    const store = createStore()

    store.setter(startEditingAtom, {
      sheetId: 'sheet-1',
      cell: { row: 4, col: 2 },
      draft: 'text',
      source: 'paste',
    })

    const cancelled = store.setter(cancelEditingAtom)

    expect(cancelled).toBe(true)
    expect(store.getter(editingSessionAtom)).toEqual({
      status: 'idle',
      source: null,
      draft: '',
    })
  })
})
