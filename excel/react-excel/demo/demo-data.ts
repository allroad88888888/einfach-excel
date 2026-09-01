import type {
  DisplayCell,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'

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

const CUSTOMERS = ['Acme Co.', 'Northwind', 'Contoso', 'Globex', 'Initech', 'Umbrella']
const REGIONS = ['North', 'East', 'South', 'West']
const PRODUCTS = ['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam', 'Mouse']
const PRICES = [79, 329, 149, 119, 89, 49]
const STATUSES = ['Paid', 'Pending', 'Shipped', 'Review'] as const

const RIGHT_ALIGNED: SpreadsheetCellFormat = Object.freeze({ align: 'right' })
const TABLE_HEADING: SpreadsheetCellFormat = Object.freeze({
  bgColor: '#f2f2f2',
  bold: true,
  fgColor: '#242424',
})
const STATUS_FORMATS: Record<(typeof STATUSES)[number], SpreadsheetCellFormat> = {
  Paid: { align: 'center', bgColor: '#dcfce7', fgColor: '#166534' },
  Pending: { align: 'center', bgColor: '#fef3c7', fgColor: '#92400e' },
  Review: { align: 'center', bgColor: '#fee2e2', fgColor: '#991b1b' },
  Shipped: { align: 'center', bgColor: '#dbeafe', fgColor: '#1e40af' },
}

const currencyFormatter = new Intl.NumberFormat('en-US', {
  currency: 'USD',
  maximumFractionDigits: 0,
  style: 'currency',
})

function displayCell(
  row: number,
  col: number,
  displayValue: string,
  format?: SpreadsheetCellFormat,
): DisplayCell {
  return { col, displayValue, format, row }
}

function createDataRow(dataRow: number): readonly DisplayCell[] {
  const row = dataRow + 1
  const productIndex = dataRow % PRODUCTS.length
  const quantity = (dataRow % 24) + 1
  const unitPrice = PRICES[productIndex] ?? 0
  const status = STATUSES[dataRow % STATUSES.length] ?? 'Review'

  return [
    displayCell(row, 0, `SO-${String(10_001 + dataRow)}`),
    displayCell(row, 1, CUSTOMERS[dataRow % CUSTOMERS.length] ?? ''),
    displayCell(row, 2, REGIONS[dataRow % REGIONS.length] ?? ''),
    displayCell(row, 3, PRODUCTS[productIndex] ?? ''),
    displayCell(row, 4, String(quantity), RIGHT_ALIGNED),
    displayCell(row, 5, currencyFormatter.format(unitPrice), RIGHT_ALIGNED),
    displayCell(row, 6, currencyFormatter.format(quantity * unitPrice), RIGHT_ALIGNED),
    displayCell(row, 7, status, STATUS_FORMATS[status]),
  ]
}

const HEADING_CELLS = DEMO_COLUMNS.map((column, col) =>
  displayCell(0, col, column.label, TABLE_HEADING),
)

export const DEMO_CELLS: readonly DisplayCell[] = Object.freeze([
  ...HEADING_CELLS,
  ...Array.from({ length: DEMO_DATA_ROW_COUNT }, (_, row) => createDataRow(row)).flat(),
])

const DEMO_CELLS_BY_COORDINATE = new Map(
  DEMO_CELLS.map((cell) => [`${cell.row}:${cell.col}`, cell]),
)

export function getDemoFormulaBarValue(row: number, col: number): string {
  if (row > 0 && col === 6) return `=E${row + 1}*F${row + 1}`
  return DEMO_CELLS_BY_COORDINATE.get(`${row}:${col}`)?.displayValue ?? ''
}
