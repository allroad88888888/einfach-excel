import { expect, test } from 'vitest'
import type { RustImportCell } from '@einfach/spreadsheet-ui-core'
import { SUMMARY_FILL_CELLS } from '../../../../src/page/demo/sales-orders/data/fill-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION as demo } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

test('independent fill samples occupy only previously empty Summary cells', () => {
  const cells = [...demo.createImportChunks() as Iterable<readonly RustImportCell[]>].flat()
  expect(SUMMARY_FILL_CELLS).toHaveLength(6)
  for (const sample of SUMMARY_FILL_CELLS) {
    const sameAddress = cells.filter(cell => cell.sheet === sample.sheet &&
      cell.row === sample.row && cell.col === sample.col)
    expect(sameAddress).toEqual([sample])
  }
  expect(demo.sheets[0].mergedRanges).toHaveLength(66)
  expect(cells.find(cell => cell.sheet === 1 && cell.row === 70 && cell.col === 1))
    .toMatchObject({ kind: 'formula', value: '=A71+$A$71' })
})
