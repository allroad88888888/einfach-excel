import type { Store } from '@einfach/core'
import { initializeWorkbookDocumentAtom } from '@einfach/spreadsheet-ui-core'
import { SALES_ORDER_COLUMNS } from '../../src/page/demo/sales-orders/data/sheet'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../src/page/demo/sales-orders/sales-orders-workbook'

/** Keep controlled projection fixtures independent of demo-only stress merges. */
export function initializeSalesOrdersStore(store: Store): void {
  const definition = SALES_ORDERS_WORKBOOK_DEFINITION
  store.setter(initializeWorkbookDocumentAtom, {
    title: definition.title,
    sheets: definition.sheets.map((sheet, index) => ({
      ...sheet, index,
      ...(sheet.id === 'orders' ? { colCount: SALES_ORDER_COLUMNS.length, mergedRanges: [] } : {}),
    })),
  })
}
