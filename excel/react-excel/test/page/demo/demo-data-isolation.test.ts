import { describe, expect, it } from 'vitest'
import type { RustImportCell, RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { SALES_ORDERS_WORKBOOK_DEFINITION as demo } from '../../../src/page/demo/sales-orders/sales-orders-workbook'
import { SALES_ORDER_MERGES } from '../../../src/page/demo/sales-orders/data/merge-seed'
import { PLAIN_SALES_ORDERS as fixture } from '../../../e2e/fixtures/plain-sales-orders/workbook'

const imported = (definition: RustWorkbookDefinition) =>
  [...definition.createImportChunks() as Iterable<readonly RustImportCell[]>].flat()

describe('demo and test data isolation', () => {
  it('retains all 66 merges in the original default demo', () => {
    expect(SALES_ORDER_MERGES).toHaveLength(66)
    expect(demo.sheets[0]).toMatchObject({ colCount: 128, mergedRanges: SALES_ORDER_MERGES })
    const cells = imported(demo).filter(cell => cell.sheet === 0)
    const indexed = new Map(cells.map(cell => [`${cell.row}:${cell.col}`, cell]))
    expect(indexed.size).toBe(cells.length)
    for (const range of SALES_ORDER_MERGES) {
      expect(indexed.get(`${range.rowStart}:${range.colStart}`))
        .toMatchObject({ kind: 'text', value: expect.stringMatching(/^#\d{2} /),
          format: { wrap: true, bold: true } })
    }
  })

  it('imports all ordinary records only in the test fixture and preserves Summary', () => {
    expect(fixture.sheets[0]).toMatchObject({ colCount: 16, mergedRanges: [] })
    expect(fixture.sheets[1]).toBe(demo.sheets[1])
    const cells = imported(fixture)
    const orders = cells.filter(cell => cell.sheet === 0 && cell.row > 0)
    const column = (col: number) => orders.filter(cell => cell.col === col)
    expect(new Set(column(0).map(cell => cell.kind === 'text' && cell.value)).size).toBe(1000)
    for (const region of ['North', 'East', 'South', 'West'])
      expect(column(2).filter(cell => cell.kind === 'text' && cell.value === region)).toHaveLength(250)
    expect(column(6)).toHaveLength(1000)
    expect(column(6).every(cell => cell.kind === 'formula')).toBe(true)
    expect(cells.filter(cell => cell.sheet === 1))
      .toEqual(imported(demo).filter(cell => cell.sheet === 1))
    expect(imported(demo).find(cell => cell.sheet === 0 && cell.row === 20 && cell.col === 0))
      .toMatchObject({ value: '#01 横向合并 · 1 × 3' })
  })
})
