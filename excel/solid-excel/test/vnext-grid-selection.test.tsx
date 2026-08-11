import { afterEach, describe, expect, it, jest } from '@jest/globals'
import { createStore } from '@einfach/core'
import {
  pointerIntentAtom,
  selectionAggregatesAtom,
  selectionAtom,
  selectionRegionsAtom,
  syncStatusBarProjectionAtom,
  type CellCoord,
  type CellRange,
  type SpreadsheetBackend,
} from '@einfach/spreadsheet-ui-core'
import { createGridDomAdapter } from '../src-vnext/grid/grid-dom-adapter'
import { installGridPointerSelection } from '../src-vnext/grid/grid-pointer-selection'
import { installGridSelection } from '../src-vnext/grid/grid-selection'

const MERGE_RANGE: CellRange = {
  rowStart: 1,
  rowEnd: 2,
  colStart: 1,
  colEnd: 2,
}

type SelectionRuntime = Parameters<typeof installGridSelection>[0]
type PointerRuntime = Parameters<typeof installGridPointerSelection>[0]

afterEach(() => {
  jest.restoreAllMocks()
})

function createRuntime(store: ReturnType<typeof createStore>) {
  let point: CellCoord | null = null
  const runtime = {
    props: {
      sheetId: 'sheet-1',
      viewport: {
        scrollTop: 0,
        scrollLeft: 0,
        viewportHeight: 3,
        viewportWidth: 3,
        rowHeight: 1,
        colWidth: 1,
        rowCount: 8,
        colCount: 8,
      },
    },
    store,
    backend: {} as SpreadsheetBackend,
    atoms: {},
    dom: createGridDomAdapter(),
    projectionSnapshot: () => ({ result: null }),
    visibleWindow: () => ({ rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 }),
    hiddenState: () => ({}),
    selectionRegions: () => store.getter(selectionRegionsAtom),
    getMergeRangeForCoord: (row: number, col: number) =>
      row >= MERGE_RANGE.rowStart &&
      row <= MERGE_RANGE.rowEnd &&
      col >= MERGE_RANGE.colStart &&
      col <= MERGE_RANGE.colEnd
        ? MERGE_RANGE
        : null,
    focusGrid: jest.fn(),
    getCellCoordFromPoint: () => point,
  }
  const selection = installGridSelection(runtime as unknown as SelectionRuntime)
  const pointer = installGridPointerSelection(runtime as unknown as PointerRuntime)
  return {
    selection,
    pointer,
    setPoint: (nextPoint: CellCoord | null) => {
      point = nextPoint
    },
  }
}

function selectionClick(options: MouseEventInit = {}) {
  return new MouseEvent('click', { bubbles: true, ...options })
}

function pointerDown() {
  return new MouseEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    button: 0,
  }) as PointerEvent
}

function pointerMove() {
  return new MouseEvent('pointermove', { bubbles: true })
}

function pointerUp() {
  return new MouseEvent('pointerup', { bubbles: true })
}

describe('vnext grid selection', () => {
  it('extends through a merged target and keeps the status summary atom coherent', () => {
    const store = createStore()
    const { selection } = createRuntime(store)
    const cells = Array.from({ length: 9 }, (_, index) => ({
      row: Math.floor(index / 3),
      col: index % 3,
      displayValue: String(index + 1),
      valueKind: 'number' as const,
      numericValue: index + 1,
    }))
    store.setter(syncStatusBarProjectionAtom, {
      sheetId: 'sheet-1',
      window: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
      cells,
      truncated: false,
    })

    selection.selectCellFromEvent(0, 0, selectionClick())
    selection.selectCellFromEvent(1, 1, selectionClick({ shiftKey: true }))

    expect(store.getter(selectionAtom)).toEqual({
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 2 },
    })
    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      count: 9,
      numericCount: 9,
      sum: 45,
      average: 5,
      truncated: false,
    })
  })

  it('appends a merge-aware range without replacing prior Ctrl selections', () => {
    const store = createStore()
    const { selection } = createRuntime(store)

    selection.selectCellFromEvent(0, 0, selectionClick())
    selection.selectCellFromEvent(3, 3, selectionClick({ ctrlKey: true }))
    selection.selectCellFromEvent(1, 1, selectionClick({ ctrlKey: true, shiftKey: true }))

    expect(store.getter(selectionRegionsAtom)).toEqual([
      {
        kind: 'cell',
        sheetId: 'sheet-1',
        anchor: { row: 0, col: 0 },
        focus: { row: 0, col: 0 },
      },
      {
        kind: 'cell',
        sheetId: 'sheet-1',
        anchor: { row: 3, col: 3 },
        focus: { row: 3, col: 3 },
      },
      {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 3, col: 3 },
        focus: { row: 1, col: 1 },
      },
    ])
  })

  it('commits a drag into a merge with the same range held in selection state', () => {
    const store = createStore()
    const { pointer, setPoint } = createRuntime(store)

    pointer.startDragSelection(pointerDown(), 0, 0)
    setPoint({ row: 1, col: 1 })
    window.dispatchEvent(pointerMove())
    window.dispatchEvent(pointerUp())

    expect(store.getter(selectionAtom)).toEqual({
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 2 },
    })
    expect(store.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      anchor: { row: 0, col: 0 },
      focus: { row: 2, col: 2 },
      range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
    })
  })

  it('reanchors an outward merge drag so its committed pointer range remains complete', () => {
    const store = createStore()
    const { pointer, setPoint } = createRuntime(store)

    pointer.startDragSelection(pointerDown(), 1, 1)
    setPoint({ row: 0, col: 0 })
    window.dispatchEvent(pointerMove())
    window.dispatchEvent(pointerUp())

    expect(store.getter(selectionAtom)).toEqual({
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 2, col: 2 },
      focus: { row: 0, col: 0 },
    })
    expect(store.getter(pointerIntentAtom)).toMatchObject({
      type: 'pointer.drag-selection.commit',
      anchor: { row: 2, col: 2 },
      focus: { row: 0, col: 0 },
      range: { rowStart: 0, rowEnd: 2, colStart: 0, colEnd: 2 },
    })
  })
})
