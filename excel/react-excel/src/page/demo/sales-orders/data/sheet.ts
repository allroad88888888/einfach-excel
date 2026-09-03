/** Defines the sheet shape rendered by the sales-orders demo page. */
export interface SalesOrderColumn {
  readonly key: string
  readonly label: string
}

export const SALES_ORDER_RECORD_COUNT = 1_000
export const SALES_ORDER_SHEET_ROW_COUNT = SALES_ORDER_RECORD_COUNT + 1

export const SALES_ORDER_COLUMNS: readonly SalesOrderColumn[] = Object.freeze([
  { key: 'order', label: 'Order' },
  { key: 'customer', label: 'Customer' },
  { key: 'region', label: 'Region' },
  { key: 'product', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unitPrice', label: 'Unit price' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
])
