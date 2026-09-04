import type { RustImportCell, SpreadsheetCellFormat } from '@einfach/spreadsheet-ui-core'
import { SALES_ORDER_COLUMNS, SALES_ORDER_RECORD_COUNT, SALES_ORDER_SHEET_ROW_COUNT } from './sheet'

export const SALES_ORDER_CELL_COUNT = SALES_ORDER_SHEET_ROW_COUNT * SALES_ORDER_COLUMNS.length
export const SALES_ORDER_IMPORT_CHUNK_SIZE = 500

export type SalesOrderImportCell = RustImportCell

const CUSTOMERS = ['Acme Co.', 'Northwind', 'Contoso', 'Globex', 'Initech', 'Umbrella']
const REGIONS = ['North', 'East', 'South', 'West']
const PRODUCTS = ['Keyboard', 'Monitor', 'Dock', 'Headset', 'Webcam', 'Mouse']
const PRICES = [79, 329, 149, 119, 89, 49]
const STATUSES = ['Paid', 'Pending', 'Shipped', 'Review']
const SALES_REPS = ['Mia', 'Noah', 'Emma', 'Liam']
const SHIP_MODES = ['Standard', 'Express', 'Pickup']
const COUNTRIES = ['USA', 'Canada', 'Germany', 'Japan']
const CITIES = ['Seattle', 'Toronto', 'Berlin', 'Tokyo']

const DEMO_TEXT_STYLES: ReadonlyMap<string, SpreadsheetCellFormat> = new Map([
  ['1:0', { bold: true }],
  ['1:1', { italic: true }],
  ['1:2', { underline: true }],
  ['1:3', { bgColor: '#fff2cc' }],
  ['1:4', { fgColor: '#c00000' }],
  ['1:5', { align: 'center' }],
  ['1:6', { fontFamily: 'Georgia' }],
  ['1:7', { fontSize: 16 }],
  ['1:8', { wrap: true }],
  ['1:9', { verticalAlign: 'top' }],
  ['1:10', { rotation: 45 }],
  [
    '1:11',
    {
      borders: {
        top: { style: 'thin', color: '#7f7f7f' },
        right: { style: 'thin', color: '#7f7f7f' },
        bottom: { style: 'thin', color: '#7f7f7f' },
        left: { style: 'thin', color: '#7f7f7f' },
      },
    },
  ],
])

function demoFormat(row: number, col: number): { readonly format?: SpreadsheetCellFormat } {
  const format = DEMO_TEXT_STYLES.get(`${row}:${col}`)
  return format ? { format } : {}
}

function textCell(row: number, col: number, value: string): SalesOrderImportCell {
  return { sheet: 0, row, col, kind: 'text', value, ...demoFormat(row, col) }
}

function numberCell(row: number, col: number, value: number): SalesOrderImportCell {
  return { sheet: 0, row, col, kind: 'number', value, ...demoFormat(row, col) }
}

function createDataRow(dataRow: number): SalesOrderImportCell[] {
  const row = dataRow + 1
  const productIndex = dataRow % PRODUCTS.length
  const quantity = (dataRow % 24) + 1
  const unitPrice = PRICES[productIndex] ?? 0
  const day = String((dataRow % 28) + 1).padStart(2, '0')
  const shipDay = String(((dataRow + 2) % 28) + 1).padStart(2, '0')
  const locationIndex = dataRow % COUNTRIES.length
  const discount = (dataRow % 5) * 0.05

  return [
    textCell(row, 0, `SO-${String(10_001 + dataRow)}`),
    textCell(row, 1, CUSTOMERS[dataRow % CUSTOMERS.length] ?? ''),
    textCell(row, 2, REGIONS[dataRow % REGIONS.length] ?? ''),
    textCell(row, 3, PRODUCTS[productIndex] ?? ''),
    numberCell(row, 4, quantity),
    numberCell(row, 5, unitPrice),
    {
      sheet: 0,
      row,
      col: 6,
      kind: 'formula',
      value: `=E${row + 1}*F${row + 1}`,
      ...demoFormat(row, 6),
    },
    textCell(row, 7, STATUSES[dataRow % STATUSES.length] ?? 'Review'),
    textCell(row, 8, SALES_REPS[dataRow % SALES_REPS.length] ?? ''),
    textCell(row, 9, `2026-08-${day}`),
    textCell(row, 10, `2026-09-${shipDay}`),
    textCell(row, 11, SHIP_MODES[dataRow % SHIP_MODES.length] ?? ''),
    textCell(row, 12, COUNTRIES[locationIndex] ?? ''),
    textCell(row, 13, CITIES[locationIndex] ?? ''),
    numberCell(row, 14, discount),
    numberCell(row, 15, quantity * unitPrice * (1 - discount) * 0.2),
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
    ...Array.from({ length: SALES_ORDER_RECORD_COUNT }, (_, row) => createDataRow(row)).flat(),
  ]
  const chunks: SalesOrderImportCell[][] = []
  for (let start = 0; start < cells.length; start += chunkSize) {
    chunks.push(cells.slice(start, start + chunkSize))
  }
  return chunks
}
