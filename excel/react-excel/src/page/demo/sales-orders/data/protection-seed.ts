import type { RustImportCell, RustWorkbookSheetDefinition } from '@einfach-excel/spreadsheet-ui-core'

/** 两张保护演示表的原生数据：整表只读、仅数量列开放编辑。 */
export const PROTECTION_DEMO_SHEETS: readonly RustWorkbookSheetDefinition[] = [
  { id: 'read-only-demo', name: '整表只读', protected: true },
  { id: 'editable-range-demo', name: '局部可编辑', protected: true,
    editableRanges: [{ rowStart: 5, rowEnd: 8, colStart: 1, colEnd: 1 }] },
].map((sheet) => ({
  ...sheet, rowCount: 32, colCount: 5,
  colWidths: [168, 112, 112, 128, 252].map((widthPx, colIndex) => ({ colIndex, widthPx })),
  rowHeights: [
    { rowIndex: 0, heightPx: 42 }, { rowIndex: 1, heightPx: 32 },
    { rowIndex: 2, heightPx: 36 }, { rowIndex: 4, heightPx: 32 },
    ...[5, 6, 7, 8, 10].map((rowIndex) => ({ rowIndex, heightPx: 34 })),
    { rowIndex: 12, heightPx: 44 },
  ],
  mergedRanges: [
    ...[0, 1, 2, 12].map((row) => ({ rowStart: row, rowEnd: row, colStart: 0, colEnd: 4 })),
    { rowStart: 10, rowEnd: 10, colStart: 0, colEnd: 2 },
  ],
}))

const records = [
  ['设备采购', 2, 1280], ['维护服务', 1, 360], ['培训课程', 3, 180], ['备件', 4, 95],
] as const
const money = { kind: 'number', digits: 2, thousands: true } as const

export const PROTECTION_DEMO_CELLS: readonly RustImportCell[] = [2, 3].flatMap((sheet) => {
  const partial = sheet === 3
  const cells: RustImportCell[] = [
    { sheet, row: 0, col: 0, kind: 'text',
      value: partial ? '局部可编辑 · 只修改绿色数量格' : '整表只读 · 查看与复制',
      format: { bold: true, fontSize: 18, bgColor: '#edf0ff', fgColor: '#283568' } },
    { sheet, row: 1, col: 0, kind: 'text',
      value: partial ? '绿色 B6:B9 可以输入；单价、金额公式和其他区域已锁定。'
        : '本表已启用工作表保护，所有单元格均不可修改。',
      format: { wrap: true, fgColor: '#596579' } },
    { sheet, row: 2, col: 0, kind: 'text',
      value: partial ? '试一试：把 B6 的 2 改为 3，金额与合计会重算；C6 的单价不可改。'
        : '试一试：双击 B6 不进入编辑，公式栏只读；仍可选中、复制。',
      format: { wrap: true, bgColor: partial ? '#e5f4eb' : '#f1f3f6', fgColor: '#465365' } },
    { sheet, row: 10, col: 0, kind: 'text', value: '订单合计',
      format: { bold: true, bgColor: '#edf0ff' } },
    { sheet, row: 10, col: 3, kind: 'formula', value: '=SUM(D6:D9)',
      format: { bold: true, numberFormat: money, bgColor: '#edf0ff' } },
    { sheet, row: 12, col: 0, kind: 'text',
      value: '恢复编辑：在顶部「工作表保护」中解除保护。新增 Sheet 不受影响；刷新可重置示例。',
      format: { wrap: true, fgColor: '#596579' } },
  ]
  for (const [col, value] of ['项目', partial ? '数量 · 可编辑' : '数量 · 只读', '单价 · 只读',
    '金额 · 自动计算', '编辑状态'].entries()) {
    cells.push({ sheet, row: 4, col, kind: 'text', value,
      format: { bold: true, bgColor: '#e8ecf3', fgColor: '#3c485c' } })
  }
  records.forEach(([item, quantity, price], offset) => {
    const row = offset + 5
    cells.push(
      { sheet, row, col: 0, kind: 'text', value: item },
      { sheet, row, col: 1, kind: 'number', value: quantity,
        format: { bgColor: partial ? '#e5f4eb' : '#f1f3f6',
          fgColor: partial ? '#17613b' : '#596579', bold: partial } },
      { sheet, row, col: 2, kind: 'number', value: price,
        format: { numberFormat: money, bgColor: '#f1f3f6', fgColor: '#596579' } },
      { sheet, row, col: 3, kind: 'formula', value: `=B${row + 1}*C${row + 1}`,
        format: { numberFormat: money } },
      { sheet, row, col: 4, kind: 'text', value: partial ? '仅绿色数量格可修改' : '整行只读，可选中复制',
        format: { fgColor: '#596579' } },
    )
  })
  return cells
})
