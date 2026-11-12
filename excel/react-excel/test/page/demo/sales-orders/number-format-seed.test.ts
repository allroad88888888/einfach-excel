import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'
import {
  createSalesOrderImportChunks, SALES_ORDER_NUMBER_FORMAT_EXAMPLES,
} from '../../../../src/page/demo/sales-orders/data/import-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

test('accounting examples occupy unused unmerged cells without replacing order values', async () => {
  const original: RustImportCell[] = []
  for await (const chunk of SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks())
    original.push(...chunk.filter(cell => !SALES_ORDER_NUMBER_FORMAT_EXAMPLES.includes(cell)))
  for (const example of SALES_ORDER_NUMBER_FORMAT_EXAMPLES) {
    expect(original.some(cell => cell.sheet === example.sheet
      && cell.row === example.row && cell.col === example.col)).toBe(false)
    const sheet = SALES_ORDERS_WORKBOOK_DEFINITION.sheets[example.sheet]
    expect(sheet.mergedRanges?.some(range => example.row >= range.rowStart
      && example.row <= range.rowEnd
      && example.col >= range.colStart && example.col <= range.colEnd)).toBe(false)
  }
  const orders = createSalesOrderImportChunks().flat()
  expect(orders.find(cell => cell.row === 18 && cell.col === 14)).toMatchObject({ value: 0.1,
    format: { numberFormat: { kind: 'custom', pattern: '[Blue]0.0%' } } })
  expect(orders.find(cell => cell.row === 18 && cell.col === 15)).toMatchObject({ value: 158.76,
    format: { numberFormat: { kind: 'custom', pattern: '_($* #,##0.00_)' } } })
})
