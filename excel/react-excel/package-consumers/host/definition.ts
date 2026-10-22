import type { RustImportCell, RustWorkbookDefinition } from '@einfach/spreadsheet-ui-core'

export const definition: RustWorkbookDefinition = {
  title: 'Packed workbook',
  sheets: ['Orders', 'Target', 'Audit'].map((name, index) => ({
    id: ['orders', 'target', 'audit'][index],
    name,
    rowCount: 1200,
    colCount: 20,
  })),
  *createImportChunks() {
    const rows: RustImportCell[] = []
    for (let row = 0; row < 1000; row++) {
      rows.push({ sheet: 0, row, col: 0, kind: 'number', value: row + 1 })
      rows.push({ sheet: 0, row, col: 1, kind: 'text', value: `Order ${row + 1}` })
    }
    rows.push({
      sheet: 0,
      row: 0,
      col: 2,
      kind: 'number',
      value: 0.125,
      format: { numberFormat: { kind: 'percent', digits: 1 } },
    })
    rows.push({ sheet: 0, row: 0, col: 3, kind: 'formula', value: '=A1*2' })
    rows.push({ sheet: 1, row: 3, col: 2, kind: 'number', value: 99 })
    rows.push({ sheet: 2, row: 29, col: 9, kind: 'formula', value: '=Orders!A1' })
    yield rows
  },
}
