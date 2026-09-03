import type { Store } from '@einfach/core'
import { initializeWorkbookDocumentAtom } from '@einfach/spreadsheet-ui-core'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../src/page/demo/sales-orders/sales-orders-workbook'

/** Publishes the Sales Orders definition into a controlled test store. */
export function initializeSalesOrdersStore(store: Store): void {
  const definition = SALES_ORDERS_WORKBOOK_DEFINITION
  store.setter(initializeWorkbookDocumentAtom, {
    title: definition.title,
    sheets: definition.sheets.map((sheet, index) => ({ ...sheet, index })),
  })
}
