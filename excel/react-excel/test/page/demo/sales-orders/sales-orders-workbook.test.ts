import { describe, expect, it } from 'vitest'
import type { RustImportCell } from '@einfach/spreadsheet-ui-core'
import { SUMMARY_FILL_CELLS } from '../../../../src/page/demo/sales-orders/data/fill-seed'
import { SUMMARY_CONDITIONAL_TEXT_CELLS, SUMMARY_CONDITIONAL_TEXT_RULES } from '../../../../src/page/demo/sales-orders/data/conditional-text-seed'
import {
  SALES_ORDER_SHEET_ROW_COUNT,
} from '../../../../src/page/demo/sales-orders/data/sheet'
import { SALES_ORDER_MERGES, SALES_ORDER_MERGE_COLUMN_COUNT } from '../../../../src/page/demo/sales-orders/data/merge-seed'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../../src/page/demo/sales-orders/sales-orders-workbook'
import { SUMMARY_VALIDATION_CELLS, SUMMARY_VALIDATIONS } from '../../../../src/page/demo/sales-orders/data/validation-seed'
import {
  SUMMARY_OUTLINE,
  SUMMARY_OUTLINE_CELLS,
} from '../../../../src/page/demo/sales-orders/data/outline-seed'
import {
  SUMMARY_NAMED_RANGES,
  SUMMARY_NAMED_RANGE_CELLS,
} from '../../../../src/page/demo/sales-orders/data/named-range-seed'
import {
  SUMMARY_TABLES, SUMMARY_TABLE_CELLS,
} from '../../../../src/page/demo/sales-orders/data/table-seed'
import {
  SALES_ORDER_SUMMARY_CELLS,
  SUMMARY_SIZES,
  SUMMARY_MERGES,
  SUMMARY_CONDITIONAL_FORMATS,
} from '../../../../src/page/demo/sales-orders/data/summary-seed'

describe('Sales Orders workbook definition', () => {
  it('describes the workbook imported by the page', () => {
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.title).toBe('Sales Orders')
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.customFormulas).toEqual([
      { name: 'ORDER_NET', parameters: ['QUANTITY', 'PRICE'], expression: '=QUANTITY*PRICE' },
    ])
    expect(SALES_ORDERS_WORKBOOK_DEFINITION.sheets).toEqual([
      {
        id: 'orders',
        name: 'Sales Orders',
        rowCount: SALES_ORDER_SHEET_ROW_COUNT,
        colCount: SALES_ORDER_MERGE_COLUMN_COUNT,
        mergedRanges: SALES_ORDER_MERGES,
        hyperlinks: [
          { row: 1, col: 1, url: 'https://example.com/customers/acme' },
          { row: 2, col: 1, url: 'https://example.com/customers/northwind' },
        ],
        notes: [{ row: 1, col: 1, text: 'Customer account review\n客户资料已核对' }],
      },
      {
        id: 'summary',
        name: 'Summary',
        rowCount: 100,
        colCount: 8,
        freeze: { rows: 1, cols: 0 },
        ...SUMMARY_SIZES,
        hiddenRows: [9],
        hiddenColumns: [6],
        mergedRanges: SUMMARY_MERGES,
        conditionalFormats: [...SUMMARY_CONDITIONAL_FORMATS, ...SUMMARY_CONDITIONAL_TEXT_RULES, {
          scope: { range: { rowStart: 74, rowEnd: 78, colStart: 7, colEnd: 7 } },
          rule: { kind: 'icon-set', iconSet: 'three-arrows',
            lowerThreshold: { type: 'percentile', value: '33' },
            upperThreshold: { type: 'percentile', value: '67' }, showValue: true },
        }],
        editableRanges: [{ rowStart: 70, rowEnd: 72, colStart: 0, colEnd: 0 }],
        comments: [{ row: 83, col: 7, author: 'Workbook example', body: 'Review this workbook cell.' }],
        dataValidations: SUMMARY_VALIDATIONS,
        outline: SUMMARY_OUTLINE,
        namedRanges: SUMMARY_NAMED_RANGES,
        tables: SUMMARY_TABLES,
      },
    ])
  })

  it('imports the summary examples into the second Rust sheet', () => {
    const chunks = SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks() as Iterable<
      readonly unknown[]
    >
    expect([...chunks].slice(-8)).toEqual([
      SALES_ORDER_SUMMARY_CELLS,
      SUMMARY_VALIDATION_CELLS,
      SUMMARY_OUTLINE_CELLS,
      SUMMARY_NAMED_RANGE_CELLS,
      SUMMARY_TABLE_CELLS,
      SUMMARY_CONDITIONAL_TEXT_CELLS,
      SUMMARY_FILL_CELLS,
      [{ sheet: 1, row: 81, col: 7, kind: 'text', value: 'ORDER_NET', format: { bold: true } },
        { sheet: 1, row: 82, col: 7, kind: 'formula', value: '=ORDER_NET(3,25)' }],
    ])
    expect(SALES_ORDER_SUMMARY_CELLS).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sheet: 1,
          row: 0,
          col: 1,
          kind: 'formula',
          value: "='Sales Orders'!G2",
        }),
        expect.objectContaining({
          sheet: 1,
          row: 1,
          col: 1,
          kind: 'formula',
          value: "='Sales Orders'!B2",
        }),
      ]),
    )
  })
  it('seeds native icon thresholds in unused Summary H74:H79', () => {
    expect(
      SALES_ORDER_SUMMARY_CELLS.filter(
        (cell) => cell.col === 7 && cell.row >= 73 && cell.row <= 78,
      ),
    ).toEqual([
      { sheet: 1, row: 73, col: 7, kind: 'text', value: 'Icon thresholds', format: { bold: true } },
      ...[0, 10, 50, 75, 100].map((value, offset) => ({
        sheet: 1,
        row: 74 + offset,
        col: 7,
        kind: 'number',
        value,
      })),
    ])
  })
  it('new conditional samples never overwrite previous demo cells', () => {
    const chunks = [...SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks() as Iterable<
      readonly RustImportCell[]
    >]
    const key = (cell: RustImportCell) => `${cell.sheet}:${cell.row}:${cell.col}`
    const previous = new Set(chunks.filter(chunk => chunk !== SUMMARY_CONDITIONAL_TEXT_CELLS)
      .flat().map(key))
    for (const cell of SUMMARY_CONDITIONAL_TEXT_CELLS) expect(previous.has(key(cell))).toBe(false)
    expect(new Set(SUMMARY_CONDITIONAL_TEXT_CELLS.map(key)).size)
      .toBe(SUMMARY_CONDITIONAL_TEXT_CELLS.length)
  })
  it('all import chunks use unique cell addresses, including the spill examples', () => {
    const cells = [...SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks() as Iterable<
      readonly RustImportCell[]
    >].flat()
    const seen = new Set<string>()
    for (const cell of cells) {
      const address = `${cell.sheet}:${cell.row}:${cell.col}`
      expect(seen.has(address), `Duplicate seed cell ${address}`).toBe(false)
      seen.add(address)
    }
  })
  it('declares a real Table with explicit header data and a structured-reference formula', () => {
    expect(SUMMARY_TABLES).toEqual(expect.arrayContaining([{ name: 'DemoTable',
      range: { rowStart: 79, rowEnd: 82, colStart: 0, colEnd: 1 }, totals: true,
      filterRules: [{ kind: 'range', colIndex: 1, min: 0 }],
      style: { preset: 'blue', bandedRows: true, firstColumn: false } }]))
    expect(SUMMARY_TABLES).toContainEqual(expect.objectContaining({
      name: 'CalculatedOrders', calculatedColumns: [null, null, '=[@Quantity]*[@Price]'],
      filterRules: [{ kind: 'range', colIndex: 0, min: 1 }],
    }))
    expect(SUMMARY_TABLE_CELLS).toEqual(expect.arrayContaining([
      expect.objectContaining({ sheet: 1, row: 79, col: 1, kind: 'text', value: 'Amount' }),
      expect.objectContaining({ sheet: 1, row: 4, col: 1, kind: 'formula',
        value: '=SUM(DemoTable[Amount])' }),
    ]))
  })
})
