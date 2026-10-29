import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** 补到原 Summary 空位的独立序列样本；保留全部原有合并、公式与填充示例。 */
export const SUMMARY_FILL_CELLS: readonly RustImportCell[] = [
  // A40:C41：已有 A 列 1/3、C 列 Item001/Item003，B 列独立按 10 递增。
  { sheet: 1, row: 39, col: 1, kind: 'number', value: 10, format: { bold: true } },
  { sheet: 1, row: 40, col: 1, kind: 'number', value: 20, format: { bold: true } },
  // C30:D31：横向每行使用自己的步长，不把二维矩形当作一条序列。
  { sheet: 1, row: 29, col: 2, kind: 'number', value: 1 },
  { sheet: 1, row: 29, col: 3, kind: 'number', value: 3 },
  { sheet: 1, row: 30, col: 2, kind: 'number', value: 10, format: { italic: true } },
  { sheet: 1, row: 30, col: 3, kind: 'number', value: 20, format: { italic: true } },
]
