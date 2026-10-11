import type { RustWorkbookDefinition } from '@einfach/spreadsheet-ui-core'
import { createSalesOrderImportChunks } from './data/import-seed'
import { SALES_ORDER_COLUMNS, SALES_ORDER_SHEET_ROW_COUNT } from './data/sheet'
import { SUMMARY_VALIDATION_CELLS, SUMMARY_VALIDATIONS } from './data/validation-seed'
import { SUMMARY_OUTLINE, SUMMARY_OUTLINE_CELLS } from './data/outline-seed'
import { SUMMARY_NAMED_RANGES, SUMMARY_NAMED_RANGE_CELLS } from './data/named-range-seed'
import {
  SALES_ORDER_SUMMARY_CELLS,
  SUMMARY_SIZES,
  SUMMARY_VISIBILITY,
  SUMMARY_MERGES,
  SUMMARY_FREEZE,
  SUMMARY_CONDITIONAL_FORMATS,
} from './data/summary-seed'

/** Defines the workbook data loaded by the Sales Orders page. */
export const SALES_ORDERS_WORKBOOK_DEFINITION: RustWorkbookDefinition = Object.freeze({
  title: 'Sales Orders',
  sheets: Object.freeze([
    {
      id: 'orders',
      name: 'Sales Orders',
      rowCount: SALES_ORDER_SHEET_ROW_COUNT,
      colCount: SALES_ORDER_COLUMNS.length,
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
      conditionalFormats: SUMMARY_CONDITIONAL_FORMATS,
      dataValidations: SUMMARY_VALIDATIONS,
      outline: SUMMARY_OUTLINE,
      namedRanges: SUMMARY_NAMED_RANGES,
    },
  ]),
  createImportChunks: () => [
    ...createSalesOrderImportChunks(),
    SALES_ORDER_SUMMARY_CELLS,
    SUMMARY_VALIDATION_CELLS,
    SUMMARY_OUTLINE_CELLS,
    SUMMARY_NAMED_RANGE_CELLS,
  ],
})
