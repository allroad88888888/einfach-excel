import { atom, createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import {
  endPointerSelectionAtom, pointerSessionAtom, selectCellAtom, selectionCellCountAtom,
  selectionRangesAtom, selectionRegionsAtom, selectionSnapshotAtom, setSelectionBoundsAtom,
  startPointerSelectionAtom, updatePointerSelectionAtom,
} from '../../src'
import { projectionSnapshotBackingAtom } from '../../src/projection/state'
import {
  setMultiRegionSelectionWithAuthorityReceiptAtom,
} from '../../src/selection'

const coord = (row: number, col: number) => ({ row, col })
function setup() {
  const store = createStore()
  store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 12 })
  store.setter(selectCellAtom, { sheetId: 's', coord: coord(1, 1) })
  return store
}
function append(store: ReturnType<typeof setup>, row: number, col: number) {
  return store.setter(startPointerSelectionAtom, { sheetId: 's', coord: coord(row, col), append: true })
}

describe('manual pointer multi-range selection', () => {
  test('modifier clicks append independent cells with the latest cell as primary, plain click resets', () => {
    const store = setup()
    append(store, 4, 4)
    store.setter(endPointerSelectionAtom)
    append(store, 6, 2)
    store.setter(endPointerSelectionAtom)
    expect(store.getter(selectionCellCountAtom)).toBe(3)
    expect(store.getter(selectionRegionsAtom)).toHaveLength(3)
    expect(store.getter(selectionSnapshotAtom).activeCell).toEqual({ sheetId: 's', row: 6, col: 2 })
    store.setter(startPointerSelectionAtom, { sheetId: 's', coord: coord(3, 3) })
    expect(store.getter(selectionRegionsAtom)).toHaveLength(1)
    expect(store.getter(selectionCellCountAtom)).toBe(1)
  })

  test('modifier drag replaces only its own region through multiple frames and reversed direction', () => {
    const store = setup()
    const original = store.getter(selectionRegionsAtom)[0]
    append(store, 5, 5)
    for (const focus of [coord(7, 7), coord(6, 6), coord(3, 3)])
      store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: focus })
    expect(store.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(store.getter(selectionRegionsAtom)[0]).toEqual(original)
    expect(store.getter(selectionSnapshotAtom)).toMatchObject({
      selection: { anchor: coord(5, 5), focus: coord(3, 3) },
      activeCell: { sheetId: 's', row: 3, col: 3 },
    })
    expect(store.getter(selectionCellCountAtom)).toBe(10)
  })

  test('duplicate clicks activate an existing cell; dragging away preserves that original cell', () => {
    const store = setup()
    append(store, 4, 4)
    store.setter(endPointerSelectionAtom)
    append(store, 1, 1)
    expect(store.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(store.getter(selectionSnapshotAtom).activeCell).toMatchObject(coord(1, 1))
    store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: coord(2, 2) })
    expect(store.getter(selectionRegionsAtom)).toHaveLength(3)
    expect(store.getter(selectionRangesAtom)[0]).toEqual({
      rowStart: 1, rowEnd: 1, colStart: 1, colEnd: 1,
    })
    expect(store.getter(selectionCellCountAtom)).toBe(5)
  })

  test('overlapping rectangles retain distinct regions, count the union and coalesce exact duplicates on release', () => {
    const store = setup()
    store.setter(startPointerSelectionAtom, { sheetId: 's', coord: coord(1, 1) })
    store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: coord(2, 2) })
    store.setter(endPointerSelectionAtom)
    append(store, 2, 2)
    store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: coord(3, 3) })
    store.setter(endPointerSelectionAtom)
    expect(store.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(store.getter(selectionCellCountAtom)).toBe(7)
    append(store, 2, 2)
    store.setter(updatePointerSelectionAtom, { sheetId: 's', coord: coord(1, 1) })
    store.setter(endPointerSelectionAtom)
    expect(store.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(store.getter(selectionCellCountAtom)).toBe(7)
    expect(store.getter(selectionSnapshotAtom).selection).toMatchObject({
      anchor: coord(2, 2), focus: coord(1, 1),
    })
  })

  test('Shift wins over append and keeps the original primary anchor', () => {
    const store = setup()
    append(store, 4, 4)
    store.setter(endPointerSelectionAtom)
    store.setter(startPointerSelectionAtom, { sheetId: 's', coord: coord(6, 6), append: true, extend: true })
    expect(store.getter(selectionRegionsAtom)).toHaveLength(1)
    expect(store.getter(selectionSnapshotAtom).selection).toMatchObject({
      anchor: coord(4, 4), focus: coord(6, 6),
    })
    expect(store.getter(pointerSessionAtom).interaction).not.toHaveProperty('append')
  })

  test('separate stores own separate regions and pointer sessions', () => {
    const first = setup()
    const second = setup()
    append(first, 5, 5)
    expect(first.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(second.getter(selectionRegionsAtom)).toHaveLength(1)
    expect(second.getter(pointerSessionAtom).status).toBe('idle')
  })

  test('multi-region authority receipt exposes merged primary inside the same writer transaction', () => {
    const store = setup()
    store.setter(projectionSnapshotBackingAtom, { status: 'ready', result: {
      kind: 'visible-window', sheetId: 's', requestId: 1, cells: [],
      window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 },
      mergedRanges: [{ rowStart: 4, rowEnd: 5, colStart: 4, colEnd: 5 }],
    } })
    const receipt = store.setter(atom(null, (_get, set) =>
      set(setMultiRegionSelectionWithAuthorityReceiptAtom, { regions: [
        { kind: 'cell', sheetId: 's', anchor: coord(1, 1), focus: coord(1, 1) },
        { kind: 'cell', sheetId: 's', anchor: coord(4, 4), focus: coord(4, 4) },
      ], primaryIndex: 1 })))
    expect(receipt?.selection).toMatchObject({ kind: 'range', anchor: coord(4, 4), focus: coord(5, 5) })
    append(store, 4, 4)
    expect(store.getter(selectionRegionsAtom)).toHaveLength(2)
    expect(store.getter(pointerSessionAtom).interaction)
      .toMatchObject({ anchor: coord(4, 4), focus: coord(5, 5) })
  })
})
