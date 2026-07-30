/**
 * Seed for the "protection-print" demo — a small invoice sheet. Layout is
 * hand-placed via the sparse `cells` array (not `matrix`) so blank spacer
 * rows and multi-row header blocks don't need filler entries: every row
 * that is not listed here simply renders blank.
 *
 * Column map: A item/label, B qty/value, C unit price, D line total.
 * Row map (0-indexed, matching `CellRange`/`DisplayCell` coordinates):
 *   0  INVOICE title
 *   1  Invoice #
 *   2  Date
 *   3  Bill To
 *   5  item table header
 *   6-10 five line items — B/C (qty, unit price) are the ONLY cells this
 *        demo leaves unlocked once the sheet is protected
 *   12 Subtotal, 13 Tax, 14 Total — all formulas, all locked
 *
 * `invoiceUnlockedRange` / `invoicePrintConfig` are plain data (not backend
 * seed fields — the static backend's `StaticSpreadsheetSeed` has no
 * protection/print slots) so `ProtectionPrintDemo.tsx` can feed them to the
 * `protectSheetAtom` / `setPrintConfigAtom` commands once the sheet id
 * resolves.
 */
import type { DisplayCell, StaticSpreadsheetSeed } from '@einfach/solid-excel/vnext'
import type { CellRange, PrintConfig } from '@einfach/spreadsheet-ui-core'

function text(row: number, col: number, value: string): DisplayCell {
  return { row, col, displayValue: value, valueKind: 'string' }
}

function num(row: number, col: number, value: number): DisplayCell {
  return { row, col, displayValue: String(value), valueKind: 'number' }
}

function formula(row: number, col: number, source: string): DisplayCell {
  return { row, col, displayValue: '0', formula: source }
}

const items: { row: number; name: string; qty: number; price: number }[] = [
  { row: 6, name: 'Consulting Hours', qty: 12, price: 150 },
  { row: 7, name: 'Software License', qty: 3, price: 299 },
  { row: 8, name: 'Onboarding Package', qty: 1, price: 500 },
  { row: 9, name: 'Support Retainer', qty: 2, price: 220 },
  { row: 10, name: 'Training Session', qty: 4, price: 90 },
]

const itemCells: DisplayCell[] = items.flatMap((item) => {
  const sheetRow = item.row + 1 // 0-indexed row N is A1 row N+1
  return [
    text(item.row, 0, item.name),
    num(item.row, 1, item.qty),
    num(item.row, 2, item.price),
    formula(item.row, 3, `=B${sheetRow}*C${sheetRow}`),
  ]
})

const cells: DisplayCell[] = [
  text(0, 0, 'INVOICE'),
  text(1, 0, 'Invoice #:'),
  text(1, 1, 'INV-1042'),
  text(2, 0, 'Date:'),
  text(2, 1, '2026-07-29'),
  text(3, 0, 'Bill To:'),
  text(3, 1, 'Acme Corp'),
  text(5, 0, 'Item'),
  text(5, 1, 'Qty'),
  text(5, 2, 'Unit Price'),
  text(5, 3, 'Line Total'),
  ...itemCells,
  text(12, 0, 'Subtotal'),
  formula(12, 3, '=SUM(D7:D11)'),
  text(13, 0, 'Tax (8%)'),
  formula(13, 3, '=D13*0.08'),
  text(14, 0, 'Total'),
  formula(14, 3, '=D13+D14'),
]

export const protectionPrintSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Invoice'],
  cells,
}

/** The only range left editable once the sheet is protected: Qty + Unit Price. */
export const invoiceUnlockedRange: CellRange = { rowStart: 6, rowEnd: 10, colStart: 1, colEnd: 2 }

/** Print area covers the whole invoice block; one manual break separates
 *  the line-item table (page 1) from the Subtotal/Tax/Total block (page 2). */
export const invoicePrintConfig: PrintConfig = {
  printArea: { rowStart: 0, rowEnd: 14, colStart: 0, colEnd: 3 },
  manualPageBreaks: [{ axis: 'row', index: 12 }],
  scale: { kind: 'percent', percent: 100 },
  orientation: 'landscape',
}
