import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'
import { SUMMARY_CUSTOM_LIST_DRAG_CELLS } from '../../../../src/page/demo/sales-orders/data/custom-list-drag-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION as demo } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

test('saved-list drag sources and sentinel occupy unique unmerged cells; targets stay blank', async () => {
  const cells: RustImportCell[] = []
  for await (const chunk of demo.createImportChunks()) cells.push(...chunk)
  expect(SUMMARY_CUSTOM_LIST_DRAG_CELLS.map(cell => [cell.row, cell.col, cell.kind === 'null' ? null : cell.value]))
    .toEqual([[54, 3, 'Medium'], [55, 3, 'High'], [58, 3, 901]])
  for (const cell of SUMMARY_CUSTOM_LIST_DRAG_CELLS) {
    expect(cells.filter(other => other.sheet === cell.sheet && other.row === cell.row &&
      other.col === cell.col)).toEqual([cell])
    expect(demo.sheets[1].mergedRanges?.some(range => cell.row >= range.rowStart &&
      cell.row <= range.rowEnd && cell.col >= range.colStart &&
      cell.col <= range.colEnd)).toBe(false)
  }
  expect(cells.filter(cell => cell.sheet === 1 && cell.col === 3 &&
    [56, 57].includes(cell.row))).toEqual([])
  expect(cells.find(cell => cell.sheet === 1 && cell.row === 54 && cell.col === 2))
    .toMatchObject({ value: 'Nov', format: { italic: true } })
  expect(cells.find(cell => cell.sheet === 1 && cell.row === 54 && cell.col === 4))
    .toMatchObject({ value: 'Low', format: { underline: true } })
})
