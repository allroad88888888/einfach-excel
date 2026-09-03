import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import { dispatchKeyboardInputAtom } from '../src/keyboard'
import { setSelectionAtom, setSelectionBoundsAtom } from '../src/selection'
import { setViewportMetricsAtom, viewportMetricsAtom } from '../src/viewport'

describe('keyboard viewport command', () => {
  test('keeps the moved cell inside the visible viewport', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 8 })
    store.setter(setSelectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-1',
      anchor: { row: 9, col: 0 },
      focus: { row: 9, col: 0 },
    })
    store.setter(setViewportMetricsAtom, {
      scrollTop: 0,
      scrollLeft: 0,
      viewportHeight: 10 * 28,
      viewportWidth: 8,
      rowHeight: 28,
      colWidth: 1,
      rowCount: 100,
      colCount: 8,
      overscanRows: 0,
      overscanCols: 0,
    })

    store.setter(dispatchKeyboardInputAtom, { key: 'ArrowDown' })

    expect(store.getter(viewportMetricsAtom).scrollTop).toBe(28)
  })
})
