import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Public same-origin JSON examples are evaluated by Rust; no result is copied into the UI. */
export const ASYNC_FORMULA_CELLS: readonly RustImportCell[] = [
  { sheet: 0, row: 0, col: 0, kind: 'text', value: 'FETCHJSON 项目扩展 / same-origin JSON extension',
    format: { bold: true } },
  { sheet: 0, row: 2, col: 0, kind: 'text', value: 'JSON price → native dependent' },
  { sheet: 0, row: 2, col: 1, kind: 'formula', value: '=FETCHJSON("/demo/async-formulas/result.json","/price")' },
  { sheet: 0, row: 2, col: 2, kind: 'formula', value: '=B3*2' },
  { sheet: 0, row: 4, col: 0, kind: 'text', value: 'JSON matrix → native spill / sum' },
  { sheet: 0, row: 4, col: 1, kind: 'formula', value: '=FETCHJSON("/demo/async-formulas/result.json","/matrix")' },
  { sheet: 0, row: 4, col: 4, kind: 'formula', value: '=SUM(B5#)' },
  { sheet: 0, row: 8, col: 0, kind: 'text', value: 'Missing JSON Pointer → #VALUE!' },
  { sheet: 0, row: 8, col: 1, kind: 'formula', value: '=FETCHJSON("/demo/async-formulas/result.json","/missing")' },
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'Native cross-sheet dependent', format: { bold: true } },
  { sheet: 1, row: 1, col: 1, kind: 'formula', value: "='Async JSON'!C3" },
]
