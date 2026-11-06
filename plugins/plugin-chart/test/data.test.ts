import { createStore } from '@einfach/core'
import { describe, expect, test } from 'vitest'
import type { DrawingRange, VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import {
  chartGridFromSnapshot, chartGridsAtom, chartRevisionAtom, loadChartGridAtom, MAX_CHART_CELLS,
} from '../src/core'
import { chartDrawing, num, publishProjection, setupChartRust, switchSheet, text } from './rust-fixture'

const range = (startRow: number, startCol: number, endRow: number, endCol: number): DrawingRange =>
  ({ startRow, startCol, endRow, endCol })
const A1B3 = range(0, 0, 2, 1)
const sheetData = () => [text(0, 0, 'Name'), text(0, 1, 'Sales'), text(1, 0, 'East'),
  num(1, 1, 10), text(2, 0, 'West'), num(2, 1, 20)]
const entryOf = (store: ReturnType<typeof setupChartRust>['store'], id = 'c') =>
  store.getter(chartGridsAtom)[id]

describe('loadChartGridAtom', () => {
  test('reads the range and publishes a ready grid with typed cells', async () => {
    const { store } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    const entry = entryOf(store)!
    expect(entry.status).toBe('ready')
    expect(entry.grid).toHaveLength(3)
    expect(entry.grid![0]).toEqual([{ display: 'Name', value: null, kind: 'string' },
      { display: 'Sales', value: null, kind: 'string' }])
    expect(entry.grid![2]![1]).toEqual({ display: '20', value: 20, kind: 'number' })
  })

  test('the same revision and region is read only once', async () => {
    const { store, reads } = setupChartRust(sheetData())
    const drawing = chartDrawing('c', [A1B3])
    await store.setter(loadChartGridAtom, drawing)
    await store.setter(loadChartGridAtom, drawing)
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3], { payload: { title: 'x' } }))
    expect(reads()).toHaveLength(1)
  })

  test('another chart on the same sheet has its own entry and its own read', async () => {
    const { store, reads } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    await store.setter(loadChartGridAtom, chartDrawing('d', [range(0, 0, 1, 0)]))
    expect(reads()).toHaveLength(2)
    expect(Object.keys(store.getter(chartGridsAtom)).sort()).toEqual(['c', 'd'])
  })

  test('a new projection revision or a changed range reads again', async () => {
    const { store, rust, reads } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    rust.cells = [...sheetData().slice(0, 5), num(2, 1, 99)]
    rust.revision = 2
    publishProjection(store, 's', 2)
    expect(store.getter(chartRevisionAtom)).toBe(2)
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(reads()).toHaveLength(2)
    expect(entryOf(store)!.grid![2]![1]!.value).toBe(99)
    await store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 1, 1)]))
    expect(reads()).toHaveLength(3)
    expect(entryOf(store)!.grid).toHaveLength(2)
  })

  test('a deleted reference (null) is an error and nothing is read', async () => {
    const { store, reads } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3, null]))
    expect(entryOf(store)).toMatchObject({ status: 'error', error: 'The chart data range was deleted.' })
    await store.setter(loadChartGridAtom, chartDrawing('e', []))
    expect(entryOf(store, 'e')).toMatchObject({ status: 'error' })
    expect(reads()).toHaveLength(0)
  })

  test('more than 10,000 cells is an error without a read', async () => {
    const { store, reads } = setupChartRust()
    expect(MAX_CHART_CELLS).toBe(10_000)
    await store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 100, 99)]))
    expect(entryOf(store)).toMatchObject({ status: 'error',
      error: 'Choose at most 10,000 cells for a chart.' })
    // The cap is on the sum over areas, and exactly 10,000 is accepted.
    await store.setter(loadChartGridAtom,
      chartDrawing('d', [range(0, 0, 99, 50), range(0, 10, 99, 60)]))
    expect(entryOf(store, 'd')!.status).toBe('error')
    expect(reads()).toHaveLength(0)
    await store.setter(loadChartGridAtom,
      chartDrawing('f', [range(0, 0, 99, 49), range(100, 0, 199, 49)]))
    expect(entryOf(store, 'f')!.status).toBe('ready')
  })

  test('areas that cannot be lined up are an error', async () => {
    const { store, reads } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 1, 2), range(5, 0, 8, 1)]))
    expect(entryOf(store)).toMatchObject({ status: 'error', error: 'The chart areas must line up.' })
    expect(reads()).toHaveLength(0)
  })

  test('same-height areas are joined side by side in one grid', async () => {
    const { store, reads } = setupChartRust([text(0, 0, 'x'), num(1, 0, 1), num(0, 3, 5), num(1, 3, 6)])
    await store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 1, 0), range(0, 3, 1, 3)]))
    expect(reads()).toHaveLength(2)
    expect(entryOf(store)!.grid!.map((row) => row.map((cell) => cell.display)))
      .toEqual([['x', '5'], ['1', '6']])
  })

  test('a failed read becomes an error entry carrying the message', async () => {
    const { store, rust } = setupChartRust(sheetData())
    rust.failRead = 'engine down'
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(entryOf(store)).toMatchObject({ status: 'error' })
    expect(entryOf(store)!.error).toContain('engine down')
  })

  test('a range outside the worksheet is an error entry', async () => {
    const { store } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 500, 1)]))
    expect(entryOf(store)).toMatchObject({ status: 'error' })
  })

  test('while a re-read is in flight the previous grid stays visible with status loading', async () => {
    const { store, rust } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    const before = entryOf(store)!.grid
    rust.defer = true
    rust.revision = 2
    publishProjection(store, 's', 2)
    const pending = store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(entryOf(store)).toMatchObject({ status: 'loading', grid: before })
    rust.cells = [...sheetData().slice(0, 5), num(2, 1, 77)]
    rust.release.forEach((release) => release())
    await pending
    expect(entryOf(store)).toMatchObject({ status: 'ready' })
  })

  test('the first load shows loading without a grid', async () => {
    const { store, rust } = setupChartRust(sheetData())
    rust.defer = true
    const pending = store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(entryOf(store)).toMatchObject({ status: 'loading', grid: undefined })
    rust.release.forEach((release) => release())
    await pending
    expect(entryOf(store)!.status).toBe('ready')
  })

  test('a result that arrives after a newer revision took over is discarded', async () => {
    const { store, rust } = setupChartRust(sheetData())
    rust.defer = true
    const first = store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    rust.cells = [...sheetData().slice(0, 5), num(2, 1, 99)]
    rust.revision = 2
    publishProjection(store, 's', 2)
    const second = store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(rust.release).toHaveLength(2)
    // The older read finishes last-but-one: its stale data must not be published.
    rust.release[0]!()
    await first
    expect(entryOf(store)).toMatchObject({ status: 'loading' })
    rust.release[1]!()
    await second
    expect(entryOf(store)!.status).toBe('ready')
    expect(entryOf(store)!.grid![2]![1]!.value).toBe(99)
  })

  test('a result that arrives after the range changed is discarded', async () => {
    const { store, rust } = setupChartRust(sheetData())
    rust.defer = true
    const first = store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    const second = store.setter(loadChartGridAtom, chartDrawing('c', [range(0, 0, 0, 1)]))
    rust.release[0]!()
    await first
    expect(entryOf(store)).toMatchObject({ status: 'loading' })
    rust.release[1]!()
    await second
    expect(entryOf(store)!.grid).toHaveLength(1)
  })

  test('entries belong to the sheet they were read on', async () => {
    const { store } = setupChartRust(sheetData())
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(entryOf(store)).toBeDefined()
    switchSheet(store, 't')
    expect(store.getter(chartGridsAtom)).toEqual({})
    switchSheet(store, 's')
    expect(entryOf(store)).toBeDefined()
  })

  test('does nothing before the first projection has a revision', async () => {
    const store = createStore()
    await store.setter(loadChartGridAtom, chartDrawing('c', [A1B3]))
    expect(store.getter(chartGridsAtom)).toEqual({})
  })
})

describe('chartGridFromSnapshot', () => {
  const snapshot = (cells: unknown[]): VisibleProjectionResult => ({ kind: 'visible-window',
    sheetId: 's', requestId: 1, window: { rowStart: 0, rowEnd: 9, colStart: 0, colEnd: 9 },
    cells }) as never
  const blank = { display: '', value: null, kind: 'blank' }

  test('fills the positions the projection omitted with blank cells', () => {
    const grid = chartGridFromSnapshot(snapshot([num(2, 1, 5), text(3, 3, 'z')]), range(2, 1, 4, 3))
    expect(grid).toHaveLength(3)
    expect(grid[0]).toEqual([{ display: '5', value: 5, kind: 'number' }, blank, blank])
    expect(grid[1]).toEqual([blank, blank, { display: 'z', value: null, kind: 'string' }])
    expect(grid[2]).toEqual([blank, blank, blank])
  })

  test('ignores cells that fall outside the range', () => {
    const grid = chartGridFromSnapshot(snapshot([num(0, 0, 1), num(2, 5, 1), num(9, 1, 1)]),
      range(1, 1, 3, 3))
    expect(grid.flat().every((cell) => cell.kind === 'blank')).toBe(true)
  })

  test('classifies errors, empty text and non-finite numbers', () => {
    const cells = [{ row: 0, col: 0, displayValue: '#DIV/0!', error: '#DIV/0!' },
      { row: 0, col: 1, displayValue: '' }, { row: 0, col: 2, displayValue: 'hi' },
      { row: 0, col: 3, displayValue: 'NaN', valueKind: 'number', numericValue: Number.NaN },
      { row: 0, col: 4, displayValue: '1', valueKind: 'number' }]
    expect(chartGridFromSnapshot(snapshot(cells), range(0, 0, 0, 4))[0]).toEqual([
      { display: '#DIV/0!', value: null, kind: 'error' }, blank,
      { display: 'hi', value: null, kind: 'string' },
      { display: 'NaN', value: null, kind: 'number' },
      { display: '1', value: null, kind: 'number' }])
  })
})
