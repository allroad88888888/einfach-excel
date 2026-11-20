import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'
import { SALES_ORDER_SPECIAL_FORMAT_EXAMPLES } from '../../../../src/page/demo/sales-orders/data/import-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

test('Special samples cannot collide with existing values or merged cells', async () => {
  const existing: RustImportCell[] = []
  for await (const chunk of SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks())
    existing.push(...chunk.filter(cell => !SALES_ORDER_SPECIAL_FORMAT_EXAMPLES.includes(cell)))
  for (const sample of SALES_ORDER_SPECIAL_FORMAT_EXAMPLES) {
    expect(existing.some(cell => cell.sheet === sample.sheet
      && cell.row === sample.row && cell.col === sample.col)).toBe(false)
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.sheets[sample.sheet].mergedRanges?.some(range =>
      sample.row >= range.rowStart && sample.row <= range.rowEnd
      && sample.col >= range.colStart && sample.col <= range.colEnd)).toBe(false)
  }
})
