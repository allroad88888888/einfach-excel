import type { RustImportCell } from '@einfach/spreadsheet-ui-core'

/** 第二张表展示跨表引用：改名后数值应保持，修改订单后仍应重算。 */
export const SALES_ORDER_SUMMARY_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'First order total', format: { bold: true } },
  { sheet: 1, row: 0, col: 1, kind: 'formula', value: "='Sales Orders'!G2" },
  { sheet: 1, row: 1, col: 0, kind: 'text', value: 'Customer' },
  { sheet: 1, row: 1, col: 1, kind: 'formula', value: "='Sales Orders'!B2" },
  { sheet: 1, row: 9, col: 0, kind: 'text', value: 'Hidden row example' },
  { sheet: 1, row: 0, col: 6, kind: 'text', value: 'Hidden column example' },
]

/** 尺寸示例属于表的行列属性，不属于上面的单元格。 */
export const SUMMARY_SIZES = {
  rowHeights: [{ rowIndex: 0, heightPx: 40 }],
  colWidths: [{ colIndex: 0, widthPx: 200 }],
} as const

/** 恢复隐藏即可看到第 10 行和 G 列的原始示例内容。 */
export const SUMMARY_VISIBILITY = { hiddenRows: [9], hiddenColumns: [6] } as const
