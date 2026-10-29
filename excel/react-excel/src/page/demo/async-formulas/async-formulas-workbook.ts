import type { RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { ASYNC_FORMULA_CELLS } from './data/async-seed'

/** The separate demo keeps asynchronous HTTP examples outside the original Sales Orders seed. */
export const ASYNC_FORMULAS_WORKBOOK: RustWorkbookDefinition = Object.freeze({
  title: 'Async formulas',
  sheets: [
    { id: 'async-json', name: 'Async JSON', rowCount: 100, colCount: 8,
      colWidths: [{ colIndex: 0, widthPx: 290 }, { colIndex: 1, widthPx: 160 },
        { colIndex: 2, widthPx: 120 }] },
    { id: 'async-summary', name: 'Async Summary', rowCount: 100, colCount: 8 },
  ],
  createImportChunks: () => [ASYNC_FORMULA_CELLS],
})
