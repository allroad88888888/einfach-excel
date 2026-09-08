import { createStore } from '@einfach/core'
import { expect, test } from 'vitest'
import {
  activeCellAtom,
  selectionAtom,
  selectionSnapshotAtom,
  selectCellAtom,
} from '../src/selection'
import { projectionSnapshotBackingAtom } from '../src/projection/state'
import { startCellEditingFromProjectionAtom } from '../src/editing/start-cell-editing'
import { editingSessionAtom } from '../src/editing/session-atoms'
import { activeCellFormatAtom } from '../src/projection'
import { dispatchKeyboardInputAtom } from '../src/keyboard'
import {
  sheetHiddenRowsBackingAtom,
  viewportHiddenColsBackingAtom,
} from '../src/viewport/hidden-state'

const merge = { rowStart: 1, rowEnd: 2, colStart: 1, colEnd: 2 }
function setup() {
  const store = createStore()
  store.setter(projectionSnapshotBackingAtom, {
    status: 'ready',
    request: undefined,
    error: undefined,
    result: {
      kind: 'visible-window',
      sheetId: 's',
      requestId: 1,
      window: { rowStart: 2, rowEnd: 5, colStart: 2, colEnd: 5 },
      cells: [],
      mergedRanges: [merge],
      mergeAnchors: [
        {
          row: 1,
          col: 1,
          displayValue: '25%',
          inputText: '=1/4',
          formula: '=1/4',
          format: { bold: true },
          mergedSpan: { rows: 2, cols: 2 },
        },
      ],
    },
  })
  return store
}

test('covered-cell selection expands to the merge and exposes the anchor as active data cell', () => {
  const store = setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 2, col: 2 } })
  expect(store.getter(selectionSnapshotAtom).range).toEqual(merge)
  expect(store.getter(activeCellAtom)).toMatchObject({ row: 1, col: 1 })
  expect(store.getter(activeCellFormatAtom)).toEqual({ bold: true })
  expect(
    store.setter(startCellEditingFromProjectionAtom, { sheetId: 's', cell: { row: 2, col: 2 } }),
  ).toBe(true)
  expect(store.getter(editingSessionAtom).source?.cell).toEqual({ row: 1, col: 1 })
})

test('reverse drag expands only intersecting merged cells without changing selection direction', () => {
  const store = setup()
  store.setter(selectionAtom, {
    kind: 'range',
    sheetId: 's',
    anchor: { row: 4, col: 4 },
    focus: { row: 2, col: 2 },
  })
  expect(store.getter(selectionAtom)).toMatchObject({
    anchor: { row: 4, col: 4 },
    focus: { row: 1, col: 1 },
  })
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 1,
    colStart: 1,
    rowEnd: 4,
    colEnd: 4,
  })
})

test('another worksheet does not inherit merged geometry', () => {
  const store = setup()
  store.setter(selectCellAtom, { sheetId: 'other', coord: { row: 2, col: 2 } })
  expect(store.getter(selectionSnapshotAtom).range).toEqual({
    rowStart: 2,
    rowEnd: 2,
    colStart: 2,
    colEnd: 2,
  })
})

test('native projection geometry drives arrow entry and exit without a React resolver', () => {
  const store = setup()
  store.setter(selectCellAtom, { sheetId: 's', coord: { row: 1, col: 3 } })
  store.setter(dispatchKeyboardInputAtom, { key: 'ArrowLeft' })
  expect(store.getter(activeCellAtom)).toMatchObject({ row: 1, col: 1 })
  store.setter(dispatchKeyboardInputAtom, { key: 'ArrowDown' })
  expect(store.getter(activeCellAtom)).toMatchObject({ row: 3, col: 1 })
})

test.each([false, true])(
  'merge editing checks the whole rectangle (fully hidden=%s)',
  (allHidden) => {
    const store = setup()
    store.setter(sheetHiddenRowsBackingAtom, { s: allHidden ? [1, 2] : [1] })
    store.setter(viewportHiddenColsBackingAtom, { s: [1] })
    expect(
      store.setter(startCellEditingFromProjectionAtom, {
        sheetId: 's',
        cell: { row: 1, col: 1 },
      }),
    ).toBe(!allHidden)
    if (!allHidden)
      expect(store.getter(editingSessionAtom).source?.cell).toEqual({ row: 1, col: 1 })
  },
)
