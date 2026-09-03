import type { RustImportCell } from '@einfach/spreadsheet-ui-core'
import { SALES_ORDER_COLUMNS, SALES_ORDER_RECORD_COUNT, SALES_ORDER_SHEET_ROW_COUNT } from './sheet'

export const SALES_ORDER_DATA_ROW_COUNT = SALES_ORDER_RECORD_COUNT
export const SALES_ORDER_COLUMN_COUNT = SALES_ORDER_COLUMNS.length
export const SALES_ORDER_CELL_COUNT = SALES_ORDER_SHEET_ROW_COUNT * SALES_ORDER_COLUMN_COUNT
export const SALES_ORDER_IMPORT_CHUNK_SIZE = 500

export type SalesOrderImportCell = RustImportCell

const CUSTOMERS = ['Acme Co.', 'Northwind', 'Contoso', 'Globex', 'Initech', 'Umbrella']
const REGIONS = ['North', 'East', 'South', 'West']
const PRODUCTS = ['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam', 'Mouse']
const PRICES = [79, 329, 149, 119, 89, 49]
const STATUSES = ['Paid', 'Pending', 'Shipped', 'Review']

function textCell(row: number, col: number, value: string): SalesOrderImportCell {
  return { sheet: 0, row, col, kind: 'text', value }
}

function numberCell(row: number, col: number, value: number): SalesOrderImportCell {
  return { sheet: 0, row, col, kind: 'number', value }
}

function createDataRow(dataRow: number): SalesOrderImportCell[] {
  const row = dataRow + 1
  const productIndex = dataRow % PRODUCTS.length
  const quantity = (dataRow % 24) + 1
  const unitPrice = PRICES[productIndex] ?? 0

  return [
    textCell(row, 0, `SO-${String(10_001 + dataRow)}`),
    textCell(row, 1, CUSTOMERS[dataRow % CUSTOMERS.length] ?? ''),
    textCell(row, 2, REGIONS[dataRow % REGIONS.length] ?? ''),
    textCell(row, 3, PRODUCTS[productIndex] ?? ''),
    numberCell(row, 4, quantity),
    numberCell(row, 5, unitPrice),
    { sheet: 0, row, col: 6, kind: 'formula', value: `=E${row + 1}*F${row + 1}` },
    textCell(row, 7, STATUSES[dataRow % STATUSES.length] ?? 'Review'),
  ]
}

/** Creates bounded chunks for the demo page's schema-shaped Rust import. */
export function createSalesOrderImportChunks(
  chunkSize = SALES_ORDER_IMPORT_CHUNK_SIZE,
): SalesOrderImportCell[][] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('Rust workbook import chunk size must be a positive integer.')
  }

  const cells: SalesOrderImportCell[] = [
    ...SALES_ORDER_COLUMNS.map(({ label }, col) => textCell(0, col, label)),
    ...Array.from({ length: SALES_ORDER_DATA_ROW_COUNT }, (_, row) => createDataRow(row)).flat(),
  ]
  const chunks: SalesOrderImportCell[][] = []
  for (let start = 0; start < cells.length; start += chunkSize) {
    chunks.push(cells.slice(start, start + chunkSize))
  }
  return chunks
}
