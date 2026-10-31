import type { RustImportCell, RustWorkbookDefinition } from '@einfach-excel/spreadsheet-ui-core'

/** 拖动边框用例的最小数据：引用来源的公式、可被覆盖的已有数据，另一张表带冻结窗格。 */
const CELLS: readonly RustImportCell[] = [
  { sheet: 0, row: 0, col: 0, kind: 'number', value: 2 },
  { sheet: 0, row: 1, col: 0, kind: 'number', value: 3 },
  { sheet: 0, row: 0, col: 1, kind: 'formula', value: '=A1*10' },
  { sheet: 0, row: 0, col: 3, kind: 'formula', value: '=SUM(A1:A2)' },
  { sheet: 0, row: 5, col: 4, kind: 'text', value: 'keep' },
  { sheet: 1, row: 0, col: 0, kind: 'text', value: 'frozen' },
  { sheet: 1, row: 4, col: 3, kind: 'number', value: 7 },
]

export const DRAG_MOVE_WORKBOOK: RustWorkbookDefinition = Object.freeze({
  title: 'Drag move',
  sheets: [
    { id: 'moves', name: 'Moves', rowCount: 200, colCount: 12 },
    { id: 'frozen', name: 'Frozen', rowCount: 200, colCount: 12, freeze: { rows: 2, cols: 1 } },
  ],
  createImportChunks: () => [CELLS],
} satisfies RustWorkbookDefinition)
