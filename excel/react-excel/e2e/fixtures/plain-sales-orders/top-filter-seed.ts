import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** E2:F9: typed rank examples imported into Rust, with ties and nonnumeric controls. */
export const SUMMARY_TOP_FILTER_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 1, col: 4, kind: 'text', value: 'Rank record', format: { bold: true } },
  { sheet: 1, row: 1, col: 5, kind: 'text', value: 'Rank score', format: { bold: true } },
  ...['Exclude 100', 'Keep 90 A', 'Keep 90 B', 'Keep 80', 'Keep text', 'Keep blank', 'Keep 70']
    .map((value, index): RustImportCell => ({
      sheet: 1, row: 2 + index, col: 4, kind: 'text', value,
    })),
  ...[100, 90, 90, 80].map((value, index): RustImportCell => ({
    sheet: 1, row: 2 + index, col: 5, kind: 'number', value,
  })),
  { sheet: 1, row: 6, col: 5, kind: 'text', value: '999' },
  { sheet: 1, row: 8, col: 5, kind: 'formula', value: '=70' },
]
