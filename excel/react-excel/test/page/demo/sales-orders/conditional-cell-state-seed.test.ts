import { expect, test } from 'vitest'
import { SALES_ORDERS_DEMO_DEFINITION as demo } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'
import { SUMMARY_CONDITIONAL_STATE_CELLS as states } from '../../../../src/page/demo/sales-orders/data/conditional-cell-state-seed'

test('all twelve state example positions are originally empty outside reserved wave regions', async () => {
  let imported = false
  for await (const chunk of demo.createImportChunks()) {
    if (chunk === states) { imported = true; continue }
    for (const cell of chunk) {
      expect(cell.sheet === 1 && cell.row >= 34 && cell.row <= 37 && cell.col <= 2).toBe(false)
    }
  }
  expect(imported).toBe(true)
  expect(states).toHaveLength(11)
  expect(states.some(cell => cell.row === 34 && cell.col === 0)).toBe(false)
  for (const cell of states) {
    expect(demo.sheets[cell.sheet].mergedRanges?.some(range =>
      cell.row >= range.rowStart && cell.row <= range.rowEnd &&
      cell.col >= range.colStart && cell.col <= range.colEnd)).toBe(false)
  }
})
