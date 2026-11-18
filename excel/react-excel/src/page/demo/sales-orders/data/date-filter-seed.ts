import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** H2:H9: native date values follow TODAY, including times and non-date controls. */
export const SUMMARY_DATE_FILTER_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 1, col: 7, kind: 'text', value: 'Date period', format: { bold: true } },
  ...['=TODAY()-1', '=TODAY()', '=TODAY()+0.75', '=TODAY()+1']
    .map((value, index): RustImportCell => ({ sheet: 1, row: 2 + index, col: 7, kind: 'formula', value,
      format: { numberFormat: { kind: 'custom', pattern: 'yyyy-mm-dd hh:mm' } },
    })),
  { sheet: 1, row: 6, col: 7, kind: 'text', value: '2024-02-29' },
  { sheet: 1, row: 8, col: 7, kind: 'formula', value: '=1/0' },
]
