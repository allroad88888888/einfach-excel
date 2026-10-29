import type { RustImportCell, RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'

/** A dedicated native fixture makes cross-sheet history assertions independent of setup edits. */
const CELLS: readonly RustImportCell[] = [
  { sheet: 0, row: 0, col: 0, kind: 'number', value: 4 },
  { sheet: 0, row: 0, col: 1, kind: 'formula', value: '=A1+$A$1+$A1+A$1+F1' },
  { sheet: 0, row: 0, col: 5, kind: 'number', value: 3 },
  { sheet: 0, row: 0, col: 6, kind: 'formula', value: '=SUM($A1:B$1)' },
  { sheet: 1, row: 0, col: 0, kind: 'formula', value: "='Cut Source'!$A$1" },
  { sheet: 1, row: 3, col: 2, kind: 'number', value: 9 },
  { sheet: 1, row: 3, col: 3, kind: 'number', value: 99 },
  { sheet: 2, row: 0, col: 0, kind: 'formula', value: "=SUM('Cut Source'!$A1:B$1)" },
  { sheet: 0, row: 5, col: 0, kind: 'formula', value: '=20' },
  { sheet: 0, row: 6, col: 0, kind: 'number', value: 20 },
  { sheet: 1, row: 7, col: 2, kind: 'number', value: 9 },
  { sheet: 1, row: 9, col: 2, kind: 'number', value: 9 },
  ...[5, 6, 7].map((value, index): RustImportCell => ({
    sheet: 0, row: 11 + index, col: 0, kind: 'number', value,
  })),
  { sheet: 2, row: 4, col: 0, kind: 'formula', value: "=SUM('Cut Source'!A12:A14)" },
  { sheet: 0, row: 19, col: 0, kind: 'text', value: 'linked', format: { bold: true, italic: true } },
  { sheet: 1, row: 19, col: 2, kind: 'text', value: 'old' },
  { sheet: 1, row: 19, col: 3, kind: 'number', value: 99 },
]

export const CROSS_SHEET_CUT_WORKBOOK: RustWorkbookDefinition = Object.freeze({
  title: 'Cross-sheet cut',
  sheets: [
    { id: 'source', name: 'Cut Source', rowCount: 100, colCount: 8,
      hyperlinks: [{ row: 19, col: 0, url: 'https://source.example/' }] },
    { id: 'target', name: "Target O'Brien", rowCount: 100, colCount: 8,
      mergedRanges: [{ rowStart: 19, rowEnd: 19, colStart: 6, colEnd: 7 }],
      dataValidations: [
        { range: { rowStart: 7, rowEnd: 7, colStart: 2, colEnd: 2 },
          rule: { kind: 'whole-number', min: 0, max: 10, ignoreBlank: true,
            errorAlert: { style: 'stop', title: 'Within 0–10', message: 'Enter a whole number from 0 to 10.' } } },
        { range: { rowStart: 9, rowEnd: 9, colStart: 2, colEnd: 2 },
          rule: { kind: 'whole-number', min: 0, max: 10, ignoreBlank: true,
            errorAlert: { style: 'warning', title: 'Within 0–10', message: 'Continue with a value outside 0 to 10?' } } },
      ] },
    { id: 'audit', name: 'Cut Audit', rowCount: 100, colCount: 8 },
  ],
  createImportChunks: () => [CELLS],
} satisfies RustWorkbookDefinition)
