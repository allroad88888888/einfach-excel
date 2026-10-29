import type { RustImportCell, RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'
import { createSalesOrderImportChunks } from '../../../src/page/demo/sales-orders/data/import-seed'
import { SALES_ORDER_COLUMNS } from '../../../src/page/demo/sales-orders/data/sheet'
import { SALES_ORDERS_WORKBOOK_DEFINITION } from '../../../src/page/demo/sales-orders/sales-orders-workbook'

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
