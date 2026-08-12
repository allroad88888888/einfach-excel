/**
 * 截断来源：聚合什么时候必须自认「结果不完整」。
 *
 * 五条来路各测一遍 —— 宿主上报的 upstream 截断、快照自身触顶 slice、投影窗口没盖住选区、
 * 选区与投影不在同一张表、以及多区间判定预算耗尽。它们最终都汇进同一个布尔量，但只要漏掉
 * 一条，用户看到的就是一个静默算错的和。
 */
import { createStore } from '@einfach/core'
import { describe, expect, test } from '@jest/globals'
import type { DisplayCell } from '../src/backend'
import {
  addSelectionRegionAtom,
  selectCellAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
} from '../src/selection'
import {
  selectionAggregatesAtom,
  STATUS_BAR_PROJECTION_CELLS_MAX,
  statusBarAggregateTruncatedAtom,
  statusBarProjectionCellsAtom,
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

type ProjectionWindowTruncationCase = [
  label: 'fully outside' | 'partially covered',
  window: NonNullable<StatusBarProjectionSyncInput['window']>,
]

const PROJECTION_WINDOW_TRUNCATION_CASES: ProjectionWindowTruncationCase[] = [
  ['fully outside', { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 }],
  ['partially covered', { rowStart: 5, rowEnd: 6, colStart: 5, colEnd: 5 }],
]

describe('selectionAggregatesAtom truncation provenance', () => {
  test('surfaces truncated flag from atom', () => {
    const store = createStore()
    store.setter(setSelectionAtom, {
      kind: 'cell',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 0 },
    })
    store.setter(syncStatusBarProjectionAtom, projectionInput([], { truncated: true }))

    const aggregates = store.getter(selectionAggregatesAtom)

    expect(aggregates.truncated).toBe(true)
  })

  test('exactly 50k cells with one region aggregate completely without truncation', () => {
    const store = createStore()
    const cells = Array.from({ length: STATUS_BAR_PROJECTION_CELLS_MAX }, (_unused, row) =>
      numericCell(row, 0, 1),
    )
    store.setter(setSelectionBoundsAtom, {
      rowCount: STATUS_BAR_PROJECTION_CELLS_MAX,
      colCount: 1,
    })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: STATUS_BAR_PROJECTION_CELLS_MAX - 1, col: 0 },
    })

    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput(cells, {
        window: {
          rowStart: 0,
          rowEnd: STATUS_BAR_PROJECTION_CELLS_MAX - 1,
          colStart: 0,
          colEnd: 0,
        },
      }),
    )

    const aggregates = store.getter(selectionAggregatesAtom)
    expect(aggregates).toMatchObject({
      sum: STATUS_BAR_PROJECTION_CELLS_MAX,
      average: 1,
      count: STATUS_BAR_PROJECTION_CELLS_MAX,
      numericCount: STATUS_BAR_PROJECTION_CELLS_MAX,
      truncated: false,
    })
  })

  test('50k + 1 cells aggregate the deterministic prefix and mark it truncated', () => {
    const store = createStore()
    const inputCellCount = STATUS_BAR_PROJECTION_CELLS_MAX + 1
    const cells = Array.from({ length: inputCellCount }, (_unused, row) => numericCell(row, 0, 1))
    store.setter(setSelectionBoundsAtom, { rowCount: inputCellCount, colCount: 1 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: inputCellCount - 1, col: 0 },
    })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput(cells, {
        window: { rowStart: 0, rowEnd: inputCellCount - 1, colStart: 0, colEnd: 0 },
      }),
    )

    const projected = store.getter(statusBarProjectionCellsAtom)
    expect(projected).toHaveLength(STATUS_BAR_PROJECTION_CELLS_MAX)
    expect(projected.at(-1)).toMatchObject({ row: STATUS_BAR_PROJECTION_CELLS_MAX - 1 })
    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: STATUS_BAR_PROJECTION_CELLS_MAX,
      count: STATUS_BAR_PROJECTION_CELLS_MAX,
      truncated: true,
    })
  })

  test('full projection coverage stays exact for sparse results', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 10, colCount: 10 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 4, col: 4 },
    })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(2, 2, 7)], {
        window: { rowStart: 0, rowEnd: 4, colStart: 0, colEnd: 4 },
      }),
    )

    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: 7,
      count: 1,
      truncated: false,
    })
  })

  test.each(PROJECTION_WINDOW_TRUNCATION_CASES)(
    'marks a selection %s the projection window as truncated',
    (_label, window) => {
      const store = createStore()
      store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
      store.setter(setSelectionAtom, {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 5, col: 5 },
        focus: { row: 7, col: 5 },
      })
      store.setter(
        syncStatusBarProjectionAtom,
        projectionInput([numericCell(5, 5, 2), numericCell(6, 5, 3)], { window }),
      )

      expect(store.getter(statusBarAggregateTruncatedAtom)).toBe(true)
    },
  )

  test('any uncovered secondary region marks the complete aggregate as truncated', () => {
    const store = createStore()
    store.setter(setSelectionBoundsAtom, { rowCount: 20, colCount: 20 })
    store.setter(setSelectionAtom, {
      kind: 'range',
      sheetId: 'sheet-1',
      anchor: { row: 0, col: 0 },
      focus: { row: 0, col: 1 },
    })
    store.setter(addSelectionRegionAtom, {
      region: {
        kind: 'range',
        sheetId: 'sheet-1',
        anchor: { row: 10, col: 0 },
        focus: { row: 10, col: 1 },
      },
    })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 1), numericCell(0, 1, 2)], {
        window: { rowStart: 0, rowEnd: 5, colStart: 0, colEnd: 5 },
      }),
    )

    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: 3,
      count: 2,
      truncated: true,
    })
  })

  test('sheet mismatch suppresses stale coordinate aggregates and marks truncation', () => {
    const store = createStore()
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    store.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 99)], { sheetId: 'sheet-2' }),
    )

    expect(store.getter(selectionAggregatesAtom)).toEqual({
      sum: 0,
      average: 0,
      count: 0,
      numericCount: 0,
      min: 0,
      max: 0,
      truncated: true,
    })
  })

  test('independent stores keep projection coverage and aggregates isolated', () => {
    const first = createStore()
    const second = createStore()
    first.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    second.setter(selectCellAtom, { sheetId: 'sheet-2', coord: { row: 0, col: 0 } })
    first.setter(syncStatusBarProjectionAtom, projectionInput([numericCell(0, 0, 1)]))
    second.setter(
      syncStatusBarProjectionAtom,
      projectionInput([numericCell(0, 0, 2)], { sheetId: 'sheet-2' }),
    )

    expect(first.getter(selectionAggregatesAtom)).toMatchObject({ sum: 1, truncated: false })
    expect(second.getter(selectionAggregatesAtom)).toMatchObject({ sum: 2, truncated: false })

    first.setter(
      syncStatusBarProjectionAtom,
      projectionInput([], { sheetId: 'sheet-other', window: null }),
    )
    expect(first.getter(selectionAggregatesAtom)).toMatchObject({ sum: 0, truncated: true })
    expect(second.getter(selectionAggregatesAtom)).toMatchObject({ sum: 2, truncated: false })
  })
})
