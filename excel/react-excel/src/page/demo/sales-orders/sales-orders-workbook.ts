import type { RustWorkbookDefinition } from '@einfach/spreadsheet-ui-core'
import { createSalesOrderImportChunks } from './data/import-seed'
import { SALES_ORDER_COLUMNS, SALES_ORDER_SHEET_ROW_COUNT } from './data/sheet'
import {
  SALES_ORDER_SUMMARY_CELLS,
  SUMMARY_SIZES,
  SUMMARY_VISIBILITY,
  SUMMARY_MERGES,
  SUMMARY_FREEZE,
} from './data/summary-seed'

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
    {
      id: 'summary',
      name: 'Summary',
      rowCount: 100,
      colCount: 8,
      ...SUMMARY_SIZES,
      ...SUMMARY_VISIBILITY,
      mergedRanges: SUMMARY_MERGES,
      freeze: SUMMARY_FREEZE,
    },
  ]),
  createImportChunks: () => [...createSalesOrderImportChunks(), SALES_ORDER_SUMMARY_CELLS],
})
