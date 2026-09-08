import { describe, expect, it } from 'vitest'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../../src/page/demo/sales-orders/data/sheet'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'
import {
  SALES_ORDER_SUMMARY_CELLS,
  SUMMARY_SIZES,
  SUMMARY_MERGES,
} from '../../../../src/page/demo/sales-orders/data/summary-seed'

describe('Sales Orders workbook definition', () => {
  it('describes the workbook imported by the page', () => {
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.title).toBe('Sales Orders')
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.sheets).toEqual([
      {
        id: 'orders',
        name: 'Sales Orders',
        rowCount: SALES_ORDER_SHEET_ROW_COUNT,
        colCount: SALES_ORDER_COLUMNS.length,
      },
      {
        id: 'summary',
        name: 'Summary',
        rowCount: 100,
        colCount: 8,
        freeze: { rows: 1, cols: 0 },
        ...SUMMARY_SIZES,
        hiddenRows: [9],
        hiddenColumns: [6],
        mergedRanges: SUMMARY_MERGES,
      },
    ])
  })

  it('imports the summary examples into the second Rust sheet', () => {
    const chunks = SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks() as Iterable<
      readonly unknown[]
    >
    expect([...chunks].at(-1)).toEqual(SALES_ORDER_SUMMARY_CELLS)
    expect(SALES_ORDER_SUMMARY_CELLS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: 1,
          row: 0,
          col: 1,
          kind: 'formula',
          value: "='Sales Orders'!G2",
        }),
        expect.objectContaining({
          sheet: 1,
          row: 1,
          col: 1,
          kind: 'formula',
          value: "='Sales Orders'!B2",
        }),
      ]),
    )
  })
})
