import type { RustImportCell, RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { createSalesOrderImportChunks } from '../../../src/page/demo/sales-orders/data/import-seed'
import { SALES_ORDER_COLUMNS } from '../../../src/page/demo/sales-orders/data/sheet'
import {
  SALES_ORDERS_DEMO_DEFINITION,
  SALES_ORDERS_WORKBOOK_DEFINITION,
} from '../../../src/page/demo/sales-orders/sales-orders-workbook'
import { SUMMARY_TOP_FILTER_CELLS } from './top-filter-seed'

/** 测试初始数据：完整订单不叠加演示合并，Summary 仍来自产品定义。 */
export const PLAIN_SALES_ORDERS: RustWorkbookDefinition = {
  ...SALES_ORDERS_WORKBOOK_DEFINITION,
  sheets: SALES_ORDERS_WORKBOOK_DEFINITION.sheets.map(sheet => sheet.id === 'orders'
    ? { ...sheet, colCount: SALES_ORDER_COLUMNS.length, mergedRanges: [] }
    : sheet),
  createImportChunks: () => [
    ...createSalesOrderImportChunks(),
    ...[...SALES_ORDERS_WORKBOOK_DEFINITION.createImportChunks() as Iterable<readonly RustImportCell[]>]
      .map(chunk => chunk.filter(cell => cell.sheet !== 0)).filter(chunk => chunk.length),
  ],
}

/** 排名筛选夹具：在产品演示工作簿上附加 E2:F9 排名样例，避免挤占 Summary 的溢出与格式测试区域。 */
export const TOP_FILTER_SALES_ORDERS: RustWorkbookDefinition = {
  ...SALES_ORDERS_DEMO_DEFINITION,
  createImportChunks: function* () {
    yield* SALES_ORDERS_DEMO_DEFINITION.createImportChunks() as Iterable<readonly RustImportCell[]>
    yield SUMMARY_TOP_FILTER_CELLS
  },
}
