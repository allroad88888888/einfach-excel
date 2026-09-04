import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import type { DisplayCell } from '../src/backend'
import { selectCellAtom, setSelectionAtom, setSelectionBoundsAtom } from '../src/selection'
import {
  selectionAggregatesAtom,
  syncStatusBarProjectionAtom,
  type StatusBarProjectionSyncInput,
} from '../src/status-bar'
import { numericCell } from './fixtures/status-bar-cells'

const DEFAULT_PROJECTION_WINDOW = { rowStart: 0, rowEnd: 99, colStart: 0, colEnd: 99 }

function projectionInput(
  cells: readonly DisplayCell[],
  overrides: Partial<StatusBarProjectionSyncInput> = {},
): StatusBarProjectionSyncInput {
  return {
    sheetId: 'sheet-1',
    window: DEFAULT_PROJECTION_WINDOW,
    cells,
    truncated: false,
    ...overrides,
  }
}

describe('selectionAggregatesAtom', () => {
  test('derives aggregates from projection cells + active selection', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 100 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 4 },
    })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([
        numericCell(0, 0, 2),
        numericCell(0, 1, 4),
        numericCell(0, 2, 6),
        numericCell(0, 3, 8),
        numericCell(0, 4, 10),
      ]),
    )

    const aggregates = store.getter(selectionAggregatesAtom)

    expect(aggregates.sum).toBe(30)
    expect(aggregates.average).toBe(6)
    expect(aggregates.count).toBe(5)
    expect(aggregates.min).toBe(2)
    expect(aggregates.max).toBe(10)
  })

  test('refreshes projection values without requiring a selection change', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 100, colCount: 100 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 1 },
    })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 10), numericCell(0, 1, 20)]),
    )
    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: 30,
      average: 15,
      count: 2,
    })

    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 40), numericCell(0, 1, 60)]),
    )
    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: 100,
      average: 50,
      count: 2,
    })
  })
})

describe('selectionAggregatesAtom reacts to selection changes', () => {
  test('aggregates change when active cell moves', () => {
    const store = createStore()
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 100), numericCell(1, 0, 200)]),
    )

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    expect(store.getter(selectionAggregatesAtom).sum).toBe(100)

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 1, col: 0 } })
    expect(store.getter(selectionAggregatesAtom).sum).toBe(200)
  })
})
