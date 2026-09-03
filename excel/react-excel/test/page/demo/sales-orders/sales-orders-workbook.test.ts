import { describe, expect, it } from '@jest/globals'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../../src/page/demo/sales-orders/data/sheet'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'

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
    ])
  })
})
