import type { RustImportCell, RustWorkbookSheetInput } from '@einfach/spreadsheet-ui-core'

/** A80:B83 导入为 Table，Rust 在第 84 行生成汇总；B5 使用结构化引用。 */
export const SUMMARY_TABLES: RustWorkbookSheetInput['tables'] = [
  { name: 'DemoTable', range: { rowStart: 79, rowEnd: 82, colStart: 0, colEnd: 1 }, totals: true },
]
export const SUMMARY_TABLE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 4, col: 0, kind: 'text', value: 'Table total', format: { bold: true } },
  { sheet: 1, row: 4, col: 1, kind: 'formula', value: '=SUM(DemoTable[Amount])' },
  { sheet: 1, row: 79, col: 0, kind: 'text', value: 'Product', format: { bold: true } },
  { sheet: 1, row: 79, col: 1, kind: 'text', value: 'Amount', format: { bold: true } },
  ...['Keyboard', 'Mouse', 'Monitor'].flatMap((value, index): RustImportCell[] => [
    { sheet: 1, row: 80 + index, col: 0, kind: 'text', value },
    { sheet: 1, row: 80 + index, col: 1, kind: 'number', value: (index + 1) * 10 },
  ]),
]
