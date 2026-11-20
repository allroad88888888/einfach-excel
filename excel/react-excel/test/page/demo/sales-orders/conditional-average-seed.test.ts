import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'
import { SALES_ORDERS_DEMO_DEFINITION as demo } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'
import { SUMMARY_CONDITIONAL_AVERAGE_CELLS as averages } from '../../../../src/page/demo/sales-orders/data/conditional-average-seed'

test('mean examples occupy unused unmerged cells outside calendar fill targets', async () => {
  const key = (cell: RustImportCell) => `${cell.sheet}:${cell.row}:${cell.col}`
  const previous = new Set<string>()
  let imported = false
  for await (const chunk of demo.createImportChunks()) {
    if (chunk === averages) { imported = true; continue }
    for (const cell of chunk) previous.add(key(cell))
  }
  expect(imported).toBe(true)
  for (const cell of averages) {
    expect(previous.has(key(cell)), key(cell)).toBe(false)
    expect(cell.row < 18 || cell.row > 24 || ![5, 7].includes(cell.col)).toBe(true)
    expect(demo.sheets[cell.sheet].mergedRanges?.some((range) =>
      cell.row >= range.rowStart && cell.row <= range.rowEnd &&
      cell.col >= range.colStart && cell.col <= range.colEnd)).toBe(false)
  }
})
