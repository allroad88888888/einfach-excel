export interface DemoColumn {
  readonly key: string
  readonly label: string
}

export const DEMO_DATA_ROW_COUNT = 1_000
export const DEMO_SHEET_ROW_COUNT = DEMO_DATA_ROW_COUNT + 1

export const DEMO_COLUMNS: readonly DemoColumn[] = Object.freeze([
  { key: 'order', label: 'Order' },
  { key: 'customer', label: 'Customer' },
  { key: 'region', label: 'Region' },
  { key: 'product', label: 'Product' },
  { key: 'quantity', label: 'Quantity' },
  { key: 'unitPrice', label: 'Unit price' },
  { key: 'total', label: 'Total' },
  { key: 'status', label: 'Status' },
])
