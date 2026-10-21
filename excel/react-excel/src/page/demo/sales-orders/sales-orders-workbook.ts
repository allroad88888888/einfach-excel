import type { RustWorkbookDefinition } from '@einfach/spreadsheet-ui-core'
import { applySalesOrderMerge, SALES_ORDER_MERGES, SALES_ORDER_MERGE_COLUMN_COUNT,
  SALES_ORDER_EXTRA_MERGE_CELLS } from './data/merge-seed'
import { createSalesOrderImportChunks } from './data/import-seed'
import { SUMMARY_FILL_CELLS } from './data/fill-seed'
import { SALES_ORDER_SHEET_ROW_COUNT } from './data/sheet'
import { SUMMARY_VALIDATION_CELLS, SUMMARY_VALIDATIONS } from './data/validation-seed'
import { SUMMARY_OUTLINE, SUMMARY_OUTLINE_CELLS } from './data/outline-seed'
import { SUMMARY_NAMED_RANGES, SUMMARY_NAMED_RANGE_CELLS } from './data/named-range-seed'
import { SUMMARY_TABLES, SUMMARY_TABLE_CELLS } from './data/table-seed'
import { SUMMARY_CONDITIONAL_TEXT_CELLS, SUMMARY_CONDITIONAL_TEXT_RULES } from './data/conditional-text-seed'
import {
  SALES_ORDER_SUMMARY_CELLS,
  SUMMARY_SIZES,
  SUMMARY_VISIBILITY,
  SUMMARY_MERGES,
  SUMMARY_FREEZE,
  SUMMARY_CONDITIONAL_FORMATS,
} from './data/summary-seed'

/** Defines the workbook data loaded by the Sales Orders page. */
export const SALES_ORDERS_WORKBOOK_DEFINITION: RustWorkbookDefinition =
  Object.freeze<RustWorkbookDefinition>({
    title: 'Sales Orders',
    customFormulas: [
      { name: 'ORDER_NET', parameters: ['QUANTITY', 'PRICE'], expression: '=QUANTITY*PRICE' },
    ],
    sheets: Object.freeze([
      {
        id: 'orders',
        name: 'Sales Orders',
        rowCount: SALES_ORDER_SHEET_ROW_COUNT,
        colCount: SALES_ORDER_MERGE_COLUMN_COUNT,
        mergedRanges: SALES_ORDER_MERGES,
        // 原始链接由 Rust 初始化；客户文字仍来自唯一的订单种子。
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
        ...SUMMARY_SIZES,
        ...SUMMARY_VISIBILITY,
        mergedRanges: SUMMARY_MERGES,
        freeze: SUMMARY_FREEZE,
        editableRanges: [{ rowStart: 70, rowEnd: 72, colStart: 0, colEnd: 0 }],
        comments: [
          { row: 83, col: 7, author: 'Workbook example', body: 'Review this workbook cell.' },
        ],
        conditionalFormats: [
          ...SUMMARY_CONDITIONAL_FORMATS,
          ...SUMMARY_CONDITIONAL_TEXT_RULES,
          {
            scope: { range: { rowStart: 74, rowEnd: 78, colStart: 7, colEnd: 7 } },
            rule: {
              kind: 'icon-set',
              iconSet: 'three-arrows',
              lowerThreshold: { type: 'percentile', value: '33' },
              upperThreshold: { type: 'percentile', value: '67' },
              showValue: true,
            },
          },
        ],
        dataValidations: SUMMARY_VALIDATIONS,
        outline: SUMMARY_OUTLINE,
        namedRanges: SUMMARY_NAMED_RANGES,
        tables: SUMMARY_TABLES,
      },
    ]),
    createImportChunks: () => [
      ...createSalesOrderImportChunks().map((chunk) => chunk.map(applySalesOrderMerge)),
      SALES_ORDER_EXTRA_MERGE_CELLS,
      SALES_ORDER_SUMMARY_CELLS,
      SUMMARY_VALIDATION_CELLS,
      SUMMARY_OUTLINE_CELLS,
      SUMMARY_NAMED_RANGE_CELLS,
      SUMMARY_TABLE_CELLS,
      SUMMARY_CONDITIONAL_TEXT_CELLS,
      SUMMARY_FILL_CELLS,
      [
        { sheet: 1, row: 81, col: 7, kind: 'text', value: 'ORDER_NET', format: { bold: true } },
        { sheet: 1, row: 82, col: 7, kind: 'formula', value: '=ORDER_NET(3,25)' },
      ],
    ],
  })
