import { describe, expect, test } from 'vitest'
import type { DrawingRange, VisibleProjectionResult } from '@einfach-excel/spreadsheet-ui-core'
import { chartHiddenFromSnapshot, visibleChartGrid } from '../src/core/visible-grid'
import type { ChartCell, ChartGrid } from '../src/core/series-layout'
import type { ChartSpec } from '../src/core/spec'

type Visibility = Partial<Record<'manualRows' | 'filterRows' | 'outlineRows' | 'manualColumns'
  | 'outlineColumns', number[]>>

const snapshot = (visibility: Visibility | undefined) =>
  ({ visibility }) as unknown as VisibleProjectionResult
/** 数据区域 B2:D4（行 1–3，列 1–3）。 */
const region: DrawingRange = { startRow: 1, startCol: 1, endRow: 3, endCol: 3 }

const cell = (display: string): ChartCell => ({ display, value: null, kind: 'string' })
const grid = (rows: number, cols: number): ChartGrid => Array.from({ length: rows },
  (_, row) => Array.from({ length: cols }, (__, col) => cell(`${row}${col}`)))
const shown = (value: ChartGrid) => value.map((row) => row.map((item) => item.display))
const flags = (over: Partial<ChartSpec> = {}) =>
  ({ showHidden: false, headerRow: false, headerCol: false, ...over })

describe('chartHiddenFromSnapshot', () => {
  test('hidden rows and columns inside the region are relative to its top-left corner', () => {
    const hidden = chartHiddenFromSnapshot(snapshot({
      manualRows: [2, 5], filterRows: [3], outlineRows: [1], manualColumns: [1, 3, 4],
      outlineColumns: [],
    }), region)
    expect(hidden).toEqual({ rows: [0, 1, 2], cols: [0, 2] })
  })

  test('the region edges are inclusive and outside indices are ignored', () => {
    const hidden = chartHiddenFromSnapshot(
      snapshot({ manualRows: [0, 1, 3, 4], manualColumns: [4] }), region)
    expect(hidden).toEqual({ rows: [0, 2], cols: [] })
  })

  test('the same row hidden by manual and filter counts once', () => {
    const hidden = chartHiddenFromSnapshot(snapshot({ manualRows: [2], filterRows: [2] }), region)
    expect(hidden.rows).toEqual([1])
  })

  test('outline-collapsed columns count as hidden', () => {
    expect(chartHiddenFromSnapshot(snapshot({ outlineColumns: [2] }), region).cols).toEqual([1])
  })

  test('a snapshot without visibility yields nothing hidden', () => {
    expect(chartHiddenFromSnapshot(snapshot(undefined), region)).toEqual({ rows: [], cols: [] })
    expect(chartHiddenFromSnapshot(snapshot({}), region)).toEqual({ rows: [], cols: [] })
  })
})

describe('visibleChartGrid', () => {
  const data = grid(4, 3)

  test('hidden data rows and columns are removed, the rest keep their order', () => {
    const visible = visibleChartGrid(data, { rows: [1], cols: [0] }, flags())
    expect(shown(visible)).toEqual([['01', '02'], ['21', '22'], ['31', '32']])
  })

  test('the header row survives being hidden when headerRow is on', () => {
    const visible = visibleChartGrid(data, { rows: [0, 2], cols: [] }, flags({ headerRow: true }))
    expect(shown(visible)).toEqual([['00', '01', '02'], ['10', '11', '12'], ['30', '31', '32']])
  })

  test('the header column survives being hidden when headerCol is on', () => {
    const visible = visibleChartGrid(data, { rows: [], cols: [0, 2] }, flags({ headerCol: true }))
    expect(shown(visible)).toEqual([['00', '01'], ['10', '11'], ['20', '21'], ['30', '31']])
  })

  test('without a header a hidden first row or column is dropped', () => {
    expect(shown(visibleChartGrid(data, { rows: [0], cols: [] }, flags())))
      .toEqual([['10', '11', '12'], ['20', '21', '22'], ['30', '31', '32']])
  })

  test('show hidden data returns the grid untouched', () => {
    const hidden = { rows: [1], cols: [1] }
    expect(visibleChartGrid(data, hidden, flags({ showHidden: true }))).toBe(data)
  })

  test('nothing hidden, or no hidden record, returns the grid untouched', () => {
    expect(visibleChartGrid(data, undefined, flags())).toBe(data)
    expect(visibleChartGrid(data, { rows: [], cols: [] }, flags())).toBe(data)
  })
})
