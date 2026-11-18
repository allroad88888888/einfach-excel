/** Native document inputs exercise real Rust facts, not a DOM-only rendering fixture. */
export const shrinkLongText = 'Inventory AVAV 2026-0000000123456789'
const entries = [
  ['A1', shrinkLongText, {}], ['B1', 'Hg', {}],
  ['D1', shrinkLongText, {}],
  ['A2', 'Hard\nbreak', { wrap: false }],
  ['B2', 'Vertical', { rotation: 'vertical' }],
  ['C2', shrinkLongText, { wrap: true }],
  ['D3', shrinkLongText, { rotation: 30, align: 'center', verticalAlign: 'center' }],
  ['A5', shrinkLongText, { align: 'centerAcross', indent: 3 }],
  ['B5', '', { align: 'centerAcross' }], ['C5', '', { align: 'centerAcross' }],
  ['A6', shrinkLongText, { indent: 3 }],
  ['A7', shrinkLongText, { fontFamily: 'ShrinkLate, monospace' }],
] as const

export const shrinkWorkbook = Buffer.from(JSON.stringify({
  format: 'einfach-workbook', version: 1, title: 'Shrink layout',
  canvases: [{ rowCount: 100, colCount: 10 }],
  workbook: {
    version: 1, sheets: [{ idx: 0, name: 'Shrink', defaults: { rowHeight: 68, colWidth: 120 } }],
    cells: entries.filter(([, value]) => value).map(([addr, value]) => ({
      sheet: 0, addr, row: Number(addr.slice(1)) - 1, col: addr.charCodeAt(0) - 65, kind: 'text', value,
    })),
    formats: [{ sheet: 0, startRow: 0, endRow: 9, startCol: 0, endCol: 9,
      cellStyles: entries.map(([addr, , format]) => ({ addr, format: {
        fontSize: 24, fontFamily: 'Arial', shrinkToFit: true, ...format,
      } })) }],
    merges: [{ sheet: 0, ranges: [[0, 3, 0, 4], [2, 3, 3, 4]] }],
  },
}))
