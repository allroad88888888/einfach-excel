import type { RustImportCell } from '@einfach-excel/spreadsheet-ui-core'

/** Native H11:H13 examples keep the existing pattern and calendar samples in place. */
export const SUMMARY_GRADIENT_FILL_CELLS: readonly RustImportCell[] = [
  { sheet: 1, row: 10, col: 7, kind: 'text', value: 'Linear gradient',
    format: { bgColor: '#fff2cc', fill: { kind: 'linear-gradient', degree: 45,
      stops: [{ position: 0, color: '#fff2cc' }, { position: 1, color: '#9dc3e6' }] } } },
  { sheet: 1, row: 11, col: 7, kind: 'null',
    format: { bgColor: '#ffffff', fill: { kind: 'path-gradient', left: 0.25, right: 0.75, top: 0.25, bottom: 0.75,
      stops: [{ position: 0, color: '#ffffff' }, { position: 1, color: '#4472c4' }] } } },
  { sheet: 1, row: 12, col: 7, kind: 'text', value: 'Three colors',
    format: { bgColor: '#e2f0d9', fill: { kind: 'linear-gradient', degree: -45,
      stops: [{ position: 0, color: '#e2f0d9' }, { position: 0.4, color: '#fff2cc' },
        { position: 1, color: '#f4b084' }] } } },
]
