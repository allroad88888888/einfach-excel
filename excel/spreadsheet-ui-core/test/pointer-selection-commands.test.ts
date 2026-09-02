import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import {
  pointerSessionAtom,
  selectionSnapshotAtom,
  setSelectionBoundsAtom,
  startPointerSelectionAtom,
  updatePointerSelectionAtom,
} from '../src'

describe('pointer selection commands', () => {
  test('start and update keep selection and pointer state in one command each', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })

    expect(store.setter(startPointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 2, col: 3 },
    })).toEqual({ status: 'applied', coord: { row: 2, col: 3 } })

    expect(store.getter(selectionSnapshotAtom)).toMatchObject({
      activeCell: { sheetId: 'sheet-1', row: 2, col: 3 },
      range: { rowStart: 2, rowEnd: 2, colStart: 3, colEnd: 3 },
    })
    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: {
        kind: 'drag-selection',
        sheetId: 'sheet-1',
        anchor: { row: 2, col: 3 },
        focus: { row: 2, col: 3 },
      },
    })

    expect(store.setter(updatePointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 5, col: 7 },
    })).toEqual({ status: 'applied', coord: { row: 5, col: 7 } })

    expect(store.getter(selectionSnapshotAtom)).toMatchObject({
      activeCell: { sheetId: 'sheet-1', row: 5, col: 7 },
      range: { rowStart: 2, rowEnd: 5, colStart: 3, colEnd: 7 },
    })
    expect(store.getter(pointerSessionAtom)).toMatchObject({
      status: 'active',
      interaction: {
        kind: 'drag-selection',
        anchor: { row: 2, col: 3 },
        focus: { row: 5, col: 7 },
      },
    })
  })

  test('ignores inactive and cross-sheet updates without changing selection', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 10 })
    const initialSelection = store.getter(selectionSnapshotAtom)

    expect(store.setter(updatePointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 4, col: 4 },
    })).toEqual({ status: 'ignored', reason: 'inactive' })
    expect(store.getter(selectionSnapshotAtom)).toEqual(initialSelection)

    store.setter(startPointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 2, col: 3 },
    })
    const activeSelection = store.getter(selectionSnapshotAtom)
    const activePointer = store.getter(pointerSessionAtom)

    expect(store.setter(updatePointerSelectionAtom, {
      sheetId: 'sheet-2',
      coord: { row: 8, col: 8 },
    })).toEqual({ status: 'ignored', reason: 'sheet-mismatch' })
    expect(store.getter(selectionSnapshotAtom)).toEqual(activeSelection)
    expect(store.getter(pointerSessionAtom)).toEqual(activePointer)
  })

  test('clamps start and update once for both selection and pointer state', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 6, colCount: 4 })

    expect(store.setter(startPointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: -10, col: 99 },
    })).toEqual({ status: 'applied', coord: { row: 0, col: 3 } })
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject({ row: 0, col: 3 })
    expect(store.getter(pointerSessionAtom).interaction).toMatchObject({
      anchor: { row: 0, col: 3 },
      focus: { row: 0, col: 3 },
    })

    expect(store.setter(updatePointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 88, col: -5 },
    })).toEqual({ status: 'applied', coord: { row: 5, col: 0 } })
    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 0,
      rowEnd: 5,
      colStart: 0,
      colEnd: 3,
    })
    expect(store.getter(pointerSessionAtom).interaction).toMatchObject({
      anchor: { row: 0, col: 3 },
      focus: { row: 5, col: 0 },
      range: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 3 },
    })
  })

  test('re-clamps an active pointer anchor after selection bounds shrink', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
    store.setter(startPointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 8, col: 8 },
    })
    store.setter(setSelectionBoundsAtom, { rowCount: 4, colCount: 3 })

    expect(store.setter(updatePointerSelectionAtom, {
      sheetId: 'sheet-1',
      coord: { row: 1, col: 1 },
    })).toEqual({ status: 'applied', coord: { row: 1, col: 1 } })
    expect(store.getter(selectionSnapshotAtom).range).toEqual({
      rowStart: 1,
      rowEnd: 3,
      colStart: 1,
      colEnd: 2,
    })
    expect(store.getter(pointerSessionAtom).interaction).toMatchObject({
      anchor: { row: 3, col: 2 },
      focus: { row: 1, col: 1 },
      range: { rowStart: 1, rowEnd: 3, colStart: 1, colEnd: 2 },
    })
  })
})
