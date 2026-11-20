import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'
import { SUMMARY_CALENDAR_CELLS } from '../../../../src/page/demo/sales-orders/data/calendar-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION as demo } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

test('calendar samples and destinations occupy free unmerged native Summary locations', async () => {
  const cells: RustImportCell[] = []
  for await (const chunk of demo.createImportChunks()) cells.push(...chunk)
  const existing = cells.filter(cell => !SUMMARY_CALENDAR_CELLS.includes(cell))
  expect(SUMMARY_CALENDAR_CELLS).toHaveLength(6)
  const formats = SUMMARY_CALENDAR_CELLS.filter(cell => cell.row === 19)
    .map(cell => cell.format?.numberFormat)
  expect(formats).toEqual(Array(2).fill({ kind: 'custom', pattern: 'yyyy-mm-dd hh:mm' }))
  for (const col of [5, 7]) for (let row = 18; row <= (col === 5 ? 23 : 24); row++) {
    expect(existing.filter(cell => cell.sheet === 1 && cell.row === row && cell.col === col))
      .toEqual([])
    expect(demo.sheets[1].mergedRanges?.some(range => row >= range.rowStart && row <= range.rowEnd
      && col >= range.colStart && col <= range.colEnd)).toBe(false)
  }
  for (const sample of SUMMARY_CALENDAR_CELLS) {
    expect(cells.filter(cell => cell.sheet === sample.sheet && cell.row === sample.row
      && cell.col === sample.col)).toEqual([sample])
  }
  expect(SUMMARY_CALENDAR_CELLS.filter(cell => cell.kind === 'number').map(cell => cell.value))
    .toEqual([45352.5, 901, 45351.25, 902])
})
