import type { RustImportCell } from '@einfach/spreadsheet-ui-core'

/** 第二张表展示跨表引用：改名后数值应保持，修改订单后仍应重算。 */
export const SALES_ORDER_SUMMARY_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'First order total', format: { bold: true } },
  { sheet: 1, row: 0, col: 1, kind: 'formula', value: "='Sales Orders'!G2" },
  { sheet: 1, row: 1, col: 0, kind: 'text', value: 'Customer' },
  { sheet: 1, row: 1, col: 1, kind: 'formula', value: "='Sales Orders'!B2" },
  { sheet: 1, row: 9, col: 0, kind: 'text', value: 'Hidden row example' },
  { sheet: 1, row: 0, col: 6, kind: 'text', value: 'Hidden column example' },
  // 查找示例保存在原生数据：emoji 的匹配位置、大小写与公式源分别可验收。
  { sheet: 1, row: 84, col: 0, kind: 'text', value: '😀alpha alpha' },
  { sheet: 1, row: 84, col: 1, kind: 'text', value: 'ALPHA' },
  { sheet: 1, row: 84, col: 2, kind: 'formula', value: '=LEN("alpha")' },
  // 通配符示例：三个普通字符、字面星号与单个 emoji。
  { sheet: 1, row: 85, col: 0, kind: 'text', value: 'SKU-100' },
  { sheet: 1, row: 85, col: 1, kind: 'text', value: 'SKU-200' },
  { sheet: 1, row: 85, col: 2, kind: 'text', value: 'SKU-*' },
  { sheet: 1, row: 86, col: 0, kind: 'text', value: 'SKU-😀' },
  // 离屏内容参与自动适应；仅给演示数据加格式，不在 React 写坐标特判。
  {
    sheet: 1,
    row: 89,
    col: 4,
    kind: 'text',
    value: 'Offscreen customer — Northwind International',
    format: { bold: true, fontSize: 14 },
  },
  {
    sheet: 1,
    row: 89,
    col: 5,
    kind: 'text',
    value: '第一行\nSecond line\n第三行',
    format: { italic: true, wrap: true },
  },
  {
    sheet: 1,
    row: 89,
    col: 7,
    kind: 'formula',
    value: "='Sales Orders'!G2*1000000",
    format: { numberFormat: { kind: 'number', digits: 2, thousands: true } },
  },
  {
    sheet: 1,
    row: 14,
    col: 0,
    kind: 'text',
    value: 'Merged heading',
    format: { bold: true, align: 'center', bgColor: '#e9edff' },
  },
  {
    sheet: 1,
    row: 16,
    col: 0,
    kind: 'text',
    value: 'Two-row merged cell',
    format: { verticalAlign: 'center', bgColor: '#fff2cc' },
  },
]

/** 尺寸示例属于表的行列属性，不属于上面的单元格。 */
export const SUMMARY_SIZES = {
  rowHeights: [{ rowIndex: 0, heightPx: 40 }],
  colWidths: [{ colIndex: 0, widthPx: 200 }],
} as const

/** 恢复隐藏即可看到第 10 行和 G 列的原始示例内容。 */
export const SUMMARY_VISIBILITY = { hiddenRows: [9], hiddenColumns: [6] } as const

/** 原生冻结示例：首行总额不随 Summary 纵向滚动。 */
export const SUMMARY_FREEZE = { rows: 1, cols: 0 } as const

/** 两个原生合并样例；覆盖格不再重复存储内容。 */
export const SUMMARY_MERGES = [
  { rowStart: 14, rowEnd: 14, colStart: 0, colEnd: 3 },
  { rowStart: 16, rowEnd: 17, colStart: 0, colEnd: 1 },
] as const
