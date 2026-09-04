import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import type { DisplayCell } from '../src/backend'
import { selectCellAtom } from '../src/selection'
import {
  DEFAULT_STATUS_BAR_AGGREGATE_CONFIG,
  selectionAggregatesAtom,
  setStatusBarAggregateConfigAtom,
  statusBarAggregateConfigAtom,
  statusBarAggregateTruncatedAtom,
  statusBarProjectionCellsAtom,
  syncStatusBarProjectionAtom,
} from '../src/status-bar'
import { numericCell } from './fixtures/status-bar-cells'

type AtomHasPublicWrite<Entity> = Entity extends { write: unknown } ? true : false

const PROJECTION_CELLS_IS_READ_ONLY: AtomHasPublicWrite<typeof statusBarProjectionCellsAtom> = false
const PROJECTION_TRUNCATED_IS_READ_ONLY: AtomHasPublicWrite<
  typeof statusBarAggregateTruncatedAtom
> = false
const AGGREGATES_IS_READ_ONLY: AtomHasPublicWrite<typeof selectionAggregatesAtom> = false
const AGGREGATE_CONFIG_IS_READ_ONLY: AtomHasPublicWrite<typeof statusBarAggregateConfigAtom> = false

describe('status bar public state boundary', () => {
  test('public state atoms expose neither typed nor runtime write authority', () => {
    expect([
      PROJECTION_CELLS_IS_READ_ONLY,
      PROJECTION_TRUNCATED_IS_READ_ONLY,
      AGGREGATES_IS_READ_ONLY,
      AGGREGATE_CONFIG_IS_READ_ONLY,
    ]).toEqual([false, false, false, false])

    const publicStateAtoms = [
      statusBarProjectionCellsAtom,
      statusBarAggregateTruncatedAtom,
      selectionAggregatesAtom,
      statusBarAggregateConfigAtom,
    ]
    expect(publicStateAtoms.map((stateAtom) => 'write' in stateAtom)).toEqual([
      false,
      false,
      false,
      false,
    ])

    const store = createStore()
    const unsafeSet = store.setter as unknown as (target: unknown, value: unknown) => unknown
    const readPublicState = () =>
      [
        store.getter(statusBarProjectionCellsAtom),
        store.getter(statusBarAggregateTruncatedAtom),
        store.getter(selectionAggregatesAtom),
        store.getter(statusBarAggregateConfigAtom),
      ] as const
    const before = readPublicState()
    const forbiddenValues: readonly unknown[] = [
      [numericCell(0, 0, 99)],
      true,
      {
        sum: 99,
        average: 0,
        count: 0,
        numericCount: 0,
        min: 0,
        max: 0,
        truncated: false,
      },
      { ...DEFAULT_STATUS_BAR_AGGREGATE_CONFIG, sum: false },
    ]

    publicStateAtoms.forEach((stateAtom, index) => {
      expect(() => unsafeSet(stateAtom, forbiddenValues[index])).toThrow()
    })
    expect(readPublicState()).toEqual(before)
  })

  test('projection command snapshots sheet and window metadata before caller mutation', () => {
    const store = createStore()
    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
    const input = {
      sheetId: 'sheet-1',
      window,
      cells: [numericCell(0, 0, 7)],
      truncated: false,
    }
    store.setter(syncStatusBarProjectionAtom, input)

    input.sheetId = 'sheet-2'
    window.rowStart = 10
    window.rowEnd = 10

    expect(store.getter(selectionAggregatesAtom)).toMatchObject({
      sum: 7,
      count: 1,
      truncated: false,
    })
  })

  test('commands copy and deeply freeze projection/config inputs before updating state', () => {
    const store = createStore()
    const cells: DisplayCell[] = [
      {
        row: 0,
        col: 0,
        displayValue: '7',
        valueKind: 'number',
        numericValue: 7,
        format: { bold: true },
      },
    ]
    const window = { rowStart: 0, rowEnd: 0, colStart: 0, colEnd: 0 }
    const input = { sheetId: 'sheet-1', window, cells, truncated: true }
    store.setter(syncStatusBarProjectionAtom, input)

    input.sheetId = 'caller-mutated-sheet'
    input.truncated = false
    window.rowStart = 10
    window.rowEnd = 10
    cells[0]!.displayValue = 'caller-mutated'
    cells[0]!.format!.bold = false
    cells.push(numericCell(0, 1, 9))

    const projected = store.getter(statusBarProjectionCellsAtom)
    expect(projected).toHaveLength(1)
    expect(projected[0]).toMatchObject({ displayValue: '7', format: { bold: true } })
    expect(store.getter(statusBarAggregateTruncatedAtom)).toBe(true)
    expect(Object.isFrozen(projected)).toBe(true)
    expect(Object.isFrozen(projected[0])).toBe(true)
    expect(Object.isFrozen(projected[0]!.format)).toBe(true)
    expect(Reflect.set(projected[0]!, 'displayValue', 'forged')).toBe(false)

    const config = {
      sum: false,
      average: true,
      count: true,
      numericCount: true,
      min: false,
      max: false,
    }
    store.setter(setStatusBarAggregateConfigAtom, config)
    config.sum = true
    config.numericCount = false

    const publishedConfig = store.getter(statusBarAggregateConfigAtom)
    expect(publishedConfig.sum).toBe(false)
    expect(publishedConfig.numericCount).toBe(true)
    expect(Object.isFrozen(publishedConfig)).toBe(true)
    expect(Reflect.set(publishedConfig, 'sum', true)).toBe(false)

    store.setter(selectCellAtom, { sheetId: 'sheet-1', coord: { row: 0, col: 0 } })
    const aggregates = store.getter(selectionAggregatesAtom)
    expect(aggregates).toMatchObject({ sum: 7, count: 1, truncated: true })
    expect(Object.isFrozen(aggregates)).toBe(true)

  })
})
