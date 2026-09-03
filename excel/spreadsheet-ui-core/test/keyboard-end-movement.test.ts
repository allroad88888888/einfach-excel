import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import { activeCellAtom, setSelectionAtom, setSelectionBoundsAtom } from '../src/selection'
import { dispatchKeyboardInputAtom } from '../src/keyboard'

describe('End-key movement', () => {
  test('moves to the last row while preserving the current column', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
    store.setter(setSelectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-1',
      anchor: { row: 5, col: 3 },
      focus: { row: 5, col: 3 },
    })

    store.setter(dispatchKeyboardInputAtom, { key: 'End' })

    expect(store.getter(activeCellAtom)).toEqual({
      sheetId: 'sheet-1',
      row: 9,
      col: 3,
    })
  })

  test('moves to the bottom-right cell with Ctrl+End', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 5 })
    store.setter(setSelectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-1',
      anchor: { row: 5, col: 3 },
      focus: { row: 5, col: 3 },
    })

    store.setter(dispatchKeyboardInputAtom, { key: 'End', ctrlKey: true })

    expect(store.getter(activeCellAtom)).toEqual({
      sheetId: 'sheet-1',
      row: 9,
      col: 4,
    })
  })
})
