import { describe, expect, test } from 'vitest'
import {
  detectChartLayout, layoutChartData, type ChartCell, type ChartGrid,
} from '../src/core/series-layout'
import { DEFAULT_CHART_SPEC, type ChartSpec } from '../src/core/spec'

const num = (value: number): ChartCell => ({ display: String(value), value, kind: 'number' })
const text = (display: string): ChartCell => ({ display, value: null, kind: 'string' })
const blank: ChartCell = { display: '', value: null, kind: 'blank' }
const fallback = (index: number) => `Series ${index + 1}`
const spec = (over: Partial<ChartSpec> = {}): ChartSpec => ({ ...DEFAULT_CHART_SPEC, ...over })

describe('layoutChartData with series in columns', () => {
  const grid: ChartGrid = [
    [text('Quarter'), text('Sales'), text('Cost')],
    [text('Q1'), num(1), num(2)],
    [text('Q2'), num(3), blank],
  ]

  test('the first row names the series and the first column gives categories', () => {
    const data = layoutChartData(grid, spec(), fallback)
    expect(data.categories).toEqual(['Q1', 'Q2'])
    // 有名称列时 xValues 是逐行数值，文字类别位置为 null。
    expect(data.xValues).toEqual([null, null])
    expect(data.series.map((entry) => entry.name)).toEqual(['Sales', 'Cost'])
    expect(data.series[0]!.values).toEqual([1, 3])
    expect(data.series[1]!.values).toEqual([2, null])
    expect(data.series[1]!.labels).toEqual(['2', ''])
  })

  test('without a header row the series take fallback names and every column is data', () => {
    const data = layoutChartData(grid, spec({ headerRow: false }), fallback)
    expect(data.series.map((entry) => entry.name)).toEqual(['Series 1', 'Series 2'])
    expect(data.categories).toEqual(['Quarter', 'Q1', 'Q2'])
    expect(data.series[0]!.values).toEqual([null, 1, 3])
  })

  test('without a header column the categories are 1-based row numbers and no X values', () => {
    const numeric: ChartGrid = [[num(1), num(2)], [num(3), num(4)]]
    const data = layoutChartData(numeric, spec({ headerRow: false, headerCol: false }), fallback)
    expect(data.categories).toEqual(['1', '2'])
    expect(data.xValues).toBeNull()
    expect(data.series.map((entry) => entry.values)).toEqual([[1, 3], [2, 4]])
  })

  test('a numeric first column becomes X values when it is a header column', () => {
    const scatter: ChartGrid = [[text('X'), text('Y')], [num(1), num(10)], [num(2), text('n/a')]]
    const data = layoutChartData(scatter, spec({ type: 'scatter' }), fallback)
    expect(data.xValues).toEqual([1, 2])
    expect(data.series[0]!.values).toEqual([10, null])
    expect(data.series[0]!.labels).toEqual(['10', 'n/a'])
  })

  test('names are trimmed and an empty name falls back to the series number', () => {
    const named: ChartGrid = [[blank, text('  Sales  '), blank], [text('Q1'), num(1), num(2)]]
    const data = layoutChartData(named, spec(), fallback)
    expect(data.series.map((entry) => entry.name)).toEqual(['Sales', 'Series 2'])
  })

  test('text cells keep their display text but contribute no value', () => {
    const cells: ChartGrid = [[text('C'), text('V')], [text('a'), { display: '12', value: 12,
      kind: 'string' }]]
    const data = layoutChartData(cells, spec(), fallback)
    expect(data.series[0]!.values).toEqual([null])
    expect(data.series[0]!.labels).toEqual(['12'])
  })
})

describe('layoutChartData with series in rows', () => {
  test('the grid is read sideways: rows are series, the top row holds categories', () => {
    const grid: ChartGrid = [
      [blank, text('Q1'), text('Q2')],
      [text('A'), num(1), num(2)],
      [text('B'), num(3), num(4)],
    ]
    const data = layoutChartData(grid, spec({ seriesIn: 'rows' }), fallback)
    expect(data.categories).toEqual(['Q1', 'Q2'])
    expect(data.series.map((entry) => entry.name)).toEqual(['A', 'B'])
    expect(data.series.map((entry) => entry.values)).toEqual([[1, 2], [3, 4]])
  })
})

describe('detectChartLayout', () => {
  test('a text header row and text header column are detected', () => {
    const grid: ChartGrid = [
      [blank, text('A'), text('B')],
      [text('Q1'), num(1), num(2)],
      [text('Q2'), num(3), num(4)],
    ]
    expect(detectChartLayout(grid)).toEqual({ seriesIn: 'columns', headerRow: true,
      headerCol: true })
  })

  test('all-numeric data has no headers', () => {
    expect(detectChartLayout([[num(1), num(2)], [num(3), num(4)]])).toEqual({
      seriesIn: 'columns', headerRow: false, headerCol: false,
    })
  })

  test('a header row of text with no numbers below is not a header', () => {
    expect(detectChartLayout([[text('A'), text('B')], [blank, blank]]).headerRow).toBe(false)
  })

  test('an all-blank first row is not a header row', () => {
    expect(detectChartLayout([[blank, blank], [num(1), num(2)]]).headerRow).toBe(false)
  })

  test('a numeric first column under a blank corner is still treated as categories', () => {
    const dates: ChartGrid = [[blank, text('A')], [num(45000), num(1)], [num(45001), num(2)]]
    expect(detectChartLayout(dates)).toEqual({ seriesIn: 'columns', headerRow: true,
      headerCol: true })
  })

  test('a numeric first column under a text header is data, not categories', () => {
    const scatter: ChartGrid = [[text('X'), text('Y')], [num(1), num(2)], [num(3), num(4)]]
    expect(detectChartLayout(scatter)).toEqual({ seriesIn: 'columns', headerRow: true,
      headerCol: false })
  })

  test('more data columns than rows puts the series in rows', () => {
    expect(detectChartLayout([[num(1), num(2), num(3), num(4)], [num(5), num(6), num(7),
      num(8)]]).seriesIn).toBe('rows')
  })

  test('equal data rows and columns keep series in columns', () => {
    expect(detectChartLayout([[num(1), num(2)], [num(3), num(4)]]).seriesIn).toBe('columns')
  })

  test('empty and single-cell grids are safe', () => {
    expect(detectChartLayout([])).toEqual({ seriesIn: 'columns', headerRow: false,
      headerCol: false })
    expect(detectChartLayout([[text('A')]])).toEqual({ seriesIn: 'columns', headerRow: false,
      headerCol: false })
  })
})
