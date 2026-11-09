import { describe, expect, test } from 'vitest'
import type { NativeTable } from '@einfach-excel/spreadsheet-ui-core'
import { parseChartSource, resolveChartSource, SOURCE_MISSING, tableOfArea,
  type SourceCatalog } from '../src/core/data-source'
import { parseChartSpec } from '../src/core/spec'

const table = (over: Partial<NativeTable> = {}): NativeTable => ({
  name: 'Sales', sheet: 'Data', sheetIndex: 1, range: 'B2:E10', hasHeaders: true,
  hasTotals: false, columns: ['Month', 'North', 'South', 'West'], ...over,
})
const catalog = (over: Partial<SourceCatalog> = {}): SourceCatalog => ({
  names: [], tables: [table()], ownerId: 'main',
  sheets: [{ id: 'main', name: 'Main', index: 0 }, { id: 'data', name: 'Data', index: 1 }],
  ...over,
})
const areas = (text: string, over: Partial<SourceCatalog> = {}) =>
  resolveChartSource(text, catalog(over))

describe('source text', () => {
  test('names, sheet-scoped names and structured table references', () => {
    expect(parseChartSource('Sales')).toEqual({ kind: 'name', name: 'Sales' })
    expect(parseChartSource("'My data'!Sales")).toEqual(
      { kind: 'name', name: 'Sales', sheet: 'My data' })
    expect(parseChartSource('Sales[North]')).toEqual(
      { kind: 'table', table: 'Sales', from: 'North', to: 'North' })
    expect(parseChartSource('Sales[[North]:[West]]')).toEqual(
      { kind: 'table', table: 'Sales', from: 'North', to: 'West' })
    expect(parseChartSource('1abc')).toBeNull()
    expect(parseChartSource('Sales[]')).toBeNull()
  })

  test('the payload keeps the source text, trimmed', () => {
    expect(parseChartSpec({ source: '  Sales[North] ' }).source).toBe('Sales[North]')
    expect(parseChartSpec({ source: 3 }).source).toBe('')
  })
})

describe('tables', () => {
  test('a whole table keeps its header row and lives on its own sheet', () => {
    expect(areas('Sales')).toEqual({ status: 'ok',
      areas: [{ startRow: 1, startCol: 1, endRow: 9, endCol: 4, sheetId: 'data' }] })
  })

  test('the totals row is not data', () => {
    expect(areas('sales', { tables: [table({ hasTotals: true })] })).toMatchObject(
      { areas: [{ endRow: 8 }] })
  })

  test('one column or a span of columns, in either order', () => {
    expect(areas('Sales[south]')).toMatchObject({ areas: [{ startCol: 3, endCol: 3 }] })
    expect(areas('Sales[[West]:[North]]')).toMatchObject({ areas: [{ startCol: 2, endCol: 4 }] })
    expect(areas('Sales[East]')).toEqual({ status: 'error', error: SOURCE_MISSING })
  })

  test('a table on the chart’s own sheet has no sheet id', () => {
    expect(areas('Sales', { ownerId: 'data' })).toMatchObject(
      { areas: [{ startRow: 1, endRow: 9 }] })
    expect((areas('Sales', { ownerId: 'data' }) as { areas: object[] }).areas[0])
      .not.toHaveProperty('sheetId')
  })

  test('a selection that is exactly a table binds to it', () => {
    const own = catalog({ ownerId: 'data' })
    expect(tableOfArea({ startRow: 1, startCol: 1, endRow: 9, endCol: 4 }, own)).toBe('Sales')
    expect(tableOfArea({ startRow: 1, startCol: 1, endRow: 8, endCol: 4 }, own)).toBeNull()
  })
})

describe('defined names', () => {
  const names = [
    { name: 'Region', scope: null, target: { sheet: 1, range: [0, 0, 4, 1] as const } },
    { name: 'Region', scope: 0, target: { sheet: 0, range: [5, 5, 6, 6] as const } },
    { name: 'Rate', scope: null, formula: '=0.2', target: null },
  ]

  test('a name scoped to the chart’s sheet wins over the workbook name', () => {
    expect(areas('Region', { names })).toEqual({ status: 'ok',
      areas: [{ startRow: 5, startCol: 5, endRow: 6, endCol: 6 }] })
    expect(areas('Region', { names, ownerId: 'data' })).toEqual({ status: 'ok',
      areas: [{ startRow: 0, startCol: 0, endRow: 4, endCol: 1 }] })
    expect(areas('Data!Region', { names })).toMatchObject(
      { areas: [{ startRow: 0, sheetId: 'data' }] })
  })

  test('formula names and unknown names do not resolve', () => {
    expect(areas('Rate', { names })).toEqual(
      { status: 'error', error: 'The chart data name must refer to a range.' })
    expect(areas('Nope', { names })).toEqual({ status: 'error', error: SOURCE_MISSING })
  })
})
