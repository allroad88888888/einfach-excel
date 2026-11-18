import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Native D/E pairs keep identical sources; D shrinks and E is an unscaled reference. */
export const SUMMARY_SHRINK_TO_FIT_CELLS: readonly RustImportCell[] = [
  ...[3, 4].flatMap((col): RustImportCell[] => {
    const format = { fontSize: 16, shrinkToFit: col === 3 }
    return [
      { sheet: 1, row: 11, col, kind: 'text', value: 'AVAV H2O sample', format, richText: [
        { text: 'AVAV H', format: { fontSize: 20 } },
        { text: '2', format: { fontBaseline: 'subscript' } },
        { text: 'O sample', format: {} },
      ] },
      { sheet: 1, row: 15, col, kind: 'text', value: 'INV-2026-0000000123456789', format },
      { sheet: 1, row: 16, col, kind: 'number', value: 123456789.25,
        format: { ...format, numberFormat: { kind: 'number', digits: 2 } } },
      { sheet: 1, row: 17, col, kind: 'formula', value: col === 3 ? '=D17*2' : '=E17*2',
        format: { ...format, numberFormat: { kind: 'number', digits: 2 } } },
    ]
  }),
]
