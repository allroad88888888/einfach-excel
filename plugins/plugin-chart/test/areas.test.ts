import { describe, expect, test } from 'vitest'
import type { DrawingRange } from '@einfach-excel/spreadsheet-ui-core'
import {
  areaLayout, combineAreaGrids, combineAreaHidden, MAX_CHART_CELLS, validateChartAreas,
} from '../src/core/areas'
import type { ChartCell, ChartGrid } from '../src/core/series-layout'

const area = (startRow: number, startCol: number, endRow: number, endCol: number): DrawingRange =>
  ({ startRow, startCol, endRow, endCol })
const cell = (display: string): ChartCell => ({ display, value: null, kind: 'string' })
const grid = (rows: string[][]): ChartGrid => rows.map((row) => row.map(cell))
const shown = (value: ChartGrid) => value.map((row) => row.map((item) => item.display))

describe('validateChartAreas', () => {
  test('no areas, or fewer than two cells, asks for the data first', () => {
    const message = 'Select the chart data first, including headers.'
    expect(validateChartAreas([])).toBe(message)
    expect(validateChartAreas([area(0, 0, 0, 0)])).toBe(message)
  })

  test('two or more cells in one aligned block are valid', () => {
    expect(validateChartAreas([area(0, 0, 0, 1)])).toBeNull()
  })

  test('up to MAX_CHART_CELLS cells is valid, one more is rejected', () => {
    expect(MAX_CHART_CELLS).toBe(10_000)
    expect(validateChartAreas([area(0, 0, MAX_CHART_CELLS - 1, 0)])).toBeNull()
    expect(validateChartAreas([area(0, 0, MAX_CHART_CELLS, 0)]))
      .toBe('Choose at most 10,000 cells for a chart.')
  })

  test('cells are summed across areas for the limit', () => {
    expect(validateChartAreas([area(0, 0, 4999, 0), area(0, 2, 5000, 2)]))
      .toBe('Choose at most 10,000 cells for a chart.')
  })

  test('areas that do not line up are rejected', () => {
    expect(validateChartAreas([area(0, 0, 1, 1), area(0, 3, 2, 3)]))
      .toBe('The chart areas must line up.')
  })
})

describe('areaLayout', () => {
  test('one area, or none, is a single block', () => {
    expect(areaLayout([])).toBe('single')
    expect(areaLayout([area(0, 0, 2, 2)])).toBe('single')
  })

  test('equal heights join side by side (columns)', () => {
    expect(areaLayout([area(0, 0, 1, 0), area(0, 2, 1, 4)])).toBe('columns')
  })

  test('equal widths with different heights stack (rows)', () => {
    expect(areaLayout([area(0, 0, 0, 1), area(1, 0, 2, 1)])).toBe('rows')
  })

  test('neither equal heights nor equal widths cannot be combined', () => {
    expect(areaLayout([area(0, 0, 1, 1), area(0, 3, 2, 3)])).toBeNull()
  })
})

describe('combineAreaGrids', () => {
  const left = grid([['a', 'b'], ['c', 'd']])
  const right = grid([['e'], ['f']])

  test('a single block is returned as is, and no blocks give an empty grid', () => {
    expect(combineAreaGrids([left], 'single')).toBe(left)
    expect(combineAreaGrids([], 'single')).toEqual([])
  })

  test('columns layout joins each row end to end', () => {
    expect(shown(combineAreaGrids([left, right], 'columns'))).toEqual([['a', 'b', 'e'],
      ['c', 'd', 'f']])
  })

  test('rows layout stacks the blocks one after another', () => {
    expect(shown(combineAreaGrids([left, right], 'rows'))).toEqual([['a', 'b'], ['c', 'd'],
      ['e'], ['f']])
  })
})

describe('combineAreaHidden', () => {
  const hiddenAt = (rows: number[], cols: number[]) => ({ rows, cols })

  test('a single block keeps its own hidden rows and columns', () => {
    expect(combineAreaHidden([hiddenAt([1], [0])], [grid([['a']])], 'single'))
      .toEqual(hiddenAt([1], [0]))
    expect(combineAreaHidden([], [], 'single')).toEqual(hiddenAt([], []))
  })

  test('columns layout shifts hidden columns by the width of the blocks before', () => {
    const grids = [grid([['a', 'b'], ['c', 'd']]), grid([['e', 'f', 'g'], ['h', 'i', 'j']])]
    const hidden = [hiddenAt([0], [1]), hiddenAt([1], [0])]
    expect(combineAreaHidden(hidden, grids, 'columns')).toEqual(hiddenAt([0], [1, 2]))
  })

  test('rows layout shifts hidden rows by the height of the blocks before', () => {
    const grids = [grid([['a'], ['b']]), grid([['c'], ['d'], ['e']])]
    const hidden = [hiddenAt([0], [1]), hiddenAt([2], [0])]
    expect(combineAreaHidden(hidden, grids, 'rows')).toEqual(hiddenAt([0, 4], [1]))
  })
})
