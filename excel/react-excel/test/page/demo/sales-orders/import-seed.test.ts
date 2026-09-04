import { describe, expect, it } from 'vitest'
import {
  SALES_ORDER_CELL_COUNT,
  SALES_ORDER_IMPORT_CHUNK_SIZE,
  createSalesOrderImportChunks,
} from '../../../../src/page/demo/sales-orders/data/import-seed'
import {
  SALES_ORDER_COLUMNS,
  SALES_ORDER_RECORD_COUNT,
} from '../../../../src/page/demo/sales-orders/data/sheet'

describe('Sales Orders import seed', () => {
  it('provides schema-shaped initial cells in bounded chunks', () => {
    const chunks = createSalesOrderImportChunks()
    const importedCells = chunks.flat()

    expect(importedCells).toHaveLength(SALES_ORDER_CELL_COUNT)
    expect(chunks.every((cells) => cells.length <= SALES_ORDER_IMPORT_CHUNK_SIZE)).toBe(true)
    expect(chunks[1]).toHaveLength(SALES_ORDER_IMPORT_CHUNK_SIZE)
    expect(importedCells.slice(0, SALES_ORDER_COLUMNS.length)).toEqual(
      SALES_ORDER_COLUMNS.map(({ label }, col) => ({
        sheet: 0,
        row: 0,
        col,
        kind: 'text',
        value: label,
      })),
    )
    expect(importedCells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: 0,
          row: SALES_ORDER_RECORD_COUNT,
          col: SALES_ORDER_COLUMNS.length - 1,
        }),
      ]),
    )
    expect(importedCells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ row: 1, col: 0, format: { bold: true } }),
        expect.objectContaining({ row: 1, col: 1, format: { italic: true } }),
        expect.objectContaining({ row: 1, col: 2, format: { underline: true } }),
        expect.objectContaining({ row: 1, col: 3, format: { bgColor: '#fff2cc' } }),
        expect.objectContaining({ row: 1, col: 4, format: { fgColor: '#c00000' } }),
        expect.objectContaining({ row: 1, col: 5, format: { align: 'center' } }),
        expect.objectContaining({ row: 1, col: 6, format: { fontFamily: 'Georgia' } }),
        expect.objectContaining({ row: 1, col: 7, format: { fontSize: 16 } }),
        expect.objectContaining({ row: 1, col: 8, format: { wrap: true } }),
        expect.objectContaining({ row: 1, col: 9, format: { verticalAlign: 'top' } }),
        expect.objectContaining({ row: 1, col: 10, format: { rotation: 45 } }),
        expect.objectContaining({
          row: 1,
          col: 11,
          format: expect.objectContaining({
            borders: expect.objectContaining({
              top: { style: 'thin', color: '#7f7f7f' },
            }),
          }),
        }),
        expect.objectContaining({ row: 1, col: 12, format: { strikethrough: true } }),
        expect.objectContaining({ row: 1, col: 13, format: { indent: 2 } }),
        expect.objectContaining({
          row: 2,
          col: 14,
          format: { numberFormat: { kind: 'percent', digits: 0 } },
        }),
        expect.objectContaining({
          row: 1,
          col: 15,
          format: { numberFormat: { kind: 'currency', symbol: '$', digits: 2 } },
        }),
        expect.objectContaining({
          row: 8,
          col: 6,
          format: { numberFormat: { kind: 'number', digits: 2, thousands: true } },
        }),
      ]),
    )
  })
})
