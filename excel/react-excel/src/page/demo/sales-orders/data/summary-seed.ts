import type { RustImportCell } from '@einfach/spreadsheet-ui-core'

/** 第二张表展示跨表引用：改名后数值应保持，修改订单后仍应重算。 */
export const SALES_ORDER_SUMMARY_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'First order total', format: { bold: true } },
  { sheet: 1, row: 0, col: 1, kind: 'formula', value: "='Sales Orders'!G2" },
  { sheet: 1, row: 1, col: 0, kind: 'text', value: 'Customer' },
  { sheet: 1, row: 1, col: 1, kind: 'formula', value: "='Sales Orders'!B2" },
  { sheet: 1, row: 9, col: 0, kind: 'text', value: 'Hidden row example' },
  { sheet: 1, row: 0, col: 6, kind: 'text', value: 'Hidden column example' },
  // 序列样本：A40:A41 等差、C40:C41 编号、E40:E43 非等差趋势。
  { sheet: 1, row: 38, col: 0, kind: 'text', value: 'Series examples', format: { bold: true } },
  { sheet: 1, row: 39, col: 0, kind: 'number', value: 1 },
  { sheet: 1, row: 40, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 39, col: 2, kind: 'text', value: 'Item001', format: { italic: true } },
  { sheet: 1, row: 40, col: 2, kind: 'text', value: 'Item003', format: { italic: true } },
  { sheet: 1, row: 39, col: 4, kind: 'number', value: 0 },
  { sheet: 1, row: 40, col: 4, kind: 'number', value: 2 },
  { sheet: 1, row: 41, col: 4, kind: 'number', value: 1 },
  { sheet: 1, row: 42, col: 4, kind: 'number', value: 5 },
  // 定向填充示例：B71:B73 向下填公式；D71:F71 向右填文字及下划线。
  { sheet: 1, row: 69, col: 0, kind: 'text', value: 'Fill examples', format: { bold: true } },
  { sheet: 1, row: 70, col: 0, kind: 'number', value: 2 },
  { sheet: 1, row: 71, col: 0, kind: 'number', value: 3 },
  { sheet: 1, row: 72, col: 0, kind: 'number', value: 4 },
  { sheet: 1, row: 70, col: 1, kind: 'formula', value: '=A71+$A$71', format: { bold: true } },
  { sheet: 1, row: 70, col: 3, kind: 'text', value: 'Fill me', format: { underline: true } },
  // 查找示例保存在原生数据：emoji 的匹配位置、大小写与公式源分别可验收。
  { sheet: 1, row: 84, col: 0, kind: 'text', value: '😀alpha alpha' },
  { sheet: 1, row: 84, col: 1, kind: 'text', value: 'ALPHA' },
  { sheet: 1, row: 84, col: 2, kind: 'formula', value: '=LEN("alpha")' },
  // 通配符示例：三个普通字符、字面星号与单个 emoji。
  { sheet: 1, row: 85, col: 0, kind: 'text', value: 'SKU-100' },
  { sheet: 1, row: 85, col: 1, kind: 'text', value: 'SKU-200' },
  { sheet: 1, row: 85, col: 2, kind: 'text', value: 'SKU-*' },
  { sheet: 1, row: 86, col: 0, kind: 'text', value: 'SKU-😀' },
  // 状态栏示例 A93:F93：数值 4 个，和 26，平均 6.5；文本数字和布尔不计数。
  { sheet: 1, row: 92, col: 0, kind: 'number', value: 10 },
  { sheet: 1, row: 92, col: 1, kind: 'number', value: 0 },
  { sheet: 1, row: 92, col: 2, kind: 'number', value: -4 },
  { sheet: 1, row: 92, col: 3, kind: 'formula', value: '=A93*2' },
  { sheet: 1, row: 92, col: 4, kind: 'text', value: '30' },
  { sheet: 1, row: 92, col: 5, kind: 'boolean', value: true },
  // A94:C94 看似空白或报错，但都有内容：非空计数为 3，数值计数为 0。
  { sheet: 1, row: 93, col: 0, kind: 'text', value: '' },
  { sheet: 1, row: 93, col: 1, kind: 'formula', value: '=""' },
  { sheet: 1, row: 93, col: 2, kind: 'formula', value: '=1/0' },
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
