import type { RustImportCell, RustWorkbookSheetInput } from '@einfach/spreadsheet-ui-core'

/** Summary 的已有数值 C65:C67 被命名；B4 直接显示 Rust 计算的 12。 */
export const SUMMARY_NAMED_RANGES: RustWorkbookSheetInput['namedRanges'] = [
  { name: 'SampleAmounts', range: { rowStart: 64, rowEnd: 66, colStart: 2, colEnd: 2 } },
]
export const SUMMARY_NAMED_RANGE_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 3, col: 0, kind: 'text', value: 'Named range total', format: { bold: true } },
  { sheet: 1, row: 3, col: 1, kind: 'formula', value: '=SUM(SampleAmounts)' },
]
