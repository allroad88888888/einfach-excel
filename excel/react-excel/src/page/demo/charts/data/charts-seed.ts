import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const REGIONS = ['North', 'South', 'East', 'West']
/** 每月各区收入（千元）：季节波动 + 各区不同增速，图表上能看出趋势差异。 */
const REVENUE = MONTHS.map((_month, month) => REGIONS.map((_region, region) =>
  Math.round(120 + region * 18 + month * (6 + region * 2) + 30 * Math.sin((month + region) / 2))))
const PRODUCTS: readonly [string, number][] = [
  ['Keyboard', 320], ['Monitor', 210], ['Dock', 145], ['Headset', 180], ['Webcam', 95],
]
/** 广告投入与收入：大致线性、带固定扰动，散点能看出相关性。 */
const SPEND = Array.from({ length: 20 }, (_, index) => {
  const spend = 8 + index * 3.5
  return [spend, Math.round(40 + spend * 4.2 + ((index * 37) % 23) - 11)] as const
})

const THOUSANDS = { numberFormat: { kind: 'number', digits: 0, thousands: true } } as const
const HEADER = { bold: true, bgColor: '#eef1fb' } as const
const text = (row: number, col: number, value: string, format?: RustImportCell['format']):
  RustImportCell => ({ sheet: 0, row, col, kind: 'text', value, ...(format ? { format } : {}) })
const number = (row: number, col: number, value: number, format?: RustImportCell['format']):
  RustImportCell => ({ sheet: 0, row, col, kind: 'number', value, ...(format ? { format } : {}) })
const formula = (row: number, col: number, value: string, format?: RustImportCell['format']):
  RustImportCell => ({ sheet: 0, row, col, kind: 'formula', value, ...(format ? { format } : {}) })

/** 四块数据：月度分区收入（A3:E15）、季度汇总公式（G11:K15）、产品销量（G3:H8）、投入与收入（M3:N23）。 */
export const CHART_DEMO_CELLS: readonly RustImportCell[] = [
  text(0, 0, 'Chart demo — edit any number and the charts follow',
    { bold: true, fontSize: 14 }),
  text(1, 0, 'Insert › chart buttons chart the selection. Drag to move, drag corners to ' +
    'resize, double-click for settings, Delete to remove; every change is undoable.'),
  text(2, 0, 'Month', HEADER),
  ...REGIONS.map((region, index) => text(2, index + 1, region, HEADER)),
  ...MONTHS.flatMap((month, row) => [
    text(row + 3, 0, month),
    ...REVENUE[row]!.map((value, col) => number(row + 3, col + 1, value, THOUSANDS)),
  ]),
  text(2, 6, 'Product', HEADER), text(2, 7, 'Units', HEADER),
  ...PRODUCTS.flatMap(([name, units], index) =>
    [text(index + 3, 6, name), number(index + 3, 7, units, THOUSANDS)]),
  // 季度汇总全是公式：改月度数字后经 Rust 重算，条形图随之变化。
  text(10, 6, 'Quarter', HEADER),
  ...REGIONS.map((region, index) => text(10, index + 7, region, HEADER)),
  ...[0, 1, 2, 3].flatMap((quarter) => [
    text(quarter + 11, 6, `Q${quarter + 1}`),
    ...REGIONS.map((_, region) => {
      const column = String.fromCharCode(66 + region)
      return formula(quarter + 11, region + 7,
        `=SUM(${column}${quarter * 3 + 4}:${column}${quarter * 3 + 6})`, THOUSANDS)
    }),
  ]),
  text(2, 12, 'Ad spend', HEADER), text(2, 13, 'Revenue', HEADER),
  ...SPEND.flatMap(([spend, revenue], index) =>
    [number(index + 3, 12, spend), number(index + 3, 13, revenue)]),
]
