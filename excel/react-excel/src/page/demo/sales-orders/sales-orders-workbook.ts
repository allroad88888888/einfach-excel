import type { RustWorkbookDefinition } from '@einfach/spreadsheet-ui-core'
import { createSalesOrderImportChunks } from './data/import-seed'
import { SALES_ORDER_COLUMNS, SALES_ORDER_SHEET_ROW_COUNT } from './data/sheet'

/** Defines the workbook data loaded by the Sales Orders page. */
export const SALES_ORDERS_WORKBOOK_DEFINITION: RustWorkbookDefinition = Object.freeze({
  title: 'Sales Orders',
  sheets: Object.freeze([
    {
      id: 'orders',
      name: 'Sales Orders',
      rowCount: SALES_ORDER_SHEET_ROW_COUNT,
      colCount: SALES_ORDER_COLUMNS.length,
    },
  ]),
  createImportChunks: createSalesOrderImportChunks,
})
