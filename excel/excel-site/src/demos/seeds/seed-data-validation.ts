/**
 * Seed data for the "data-validation" demo — a small order form with three
 * validation rules already configured: Qty (whole number 1-999), Status (a
 * fixed list), and Discount % (0-100, warn-only). The static backend has no
 * rule-read-back port (see `excel/spreadsheet-ui-core/src/data-validation/
 * README.md`: "Backend reads: none") and no seed-time hook that calls
 * `setValidationRule` — `StaticSpreadsheetSeed` is purely declarative. So
 * "pre-seeding a rule" here means what `excel/solid-excel/src-vnext/demos/
 * VNextSmokeDemo.tsx` does: author the `DisplayCell.validation` outcome that
 * `applyValidationRule` (static-backend.ts) would have produced, directly on
 * the cells that already violate it. `validationMessageForRule` /
 * `validationSeverityForMode` are imported (not re-typed) so the seeded
 * message/severity can never drift from what the real backend emits for the
 * same rule + mode.
 *
 * This also documents the honest limits of the static backend for anyone
 * extending this demo: `updateCell` (static-backend.ts) always replaces a
 * cell with a fresh `DisplayCell`, so typing any new value into a flagged
 * cell drops its `.validation` outcome immediately — "fix the value" clears
 * the diagnostic, but so would typing a different bad one. There is no
 * per-keystroke re-check against the configured rule outside the Data
 * Validation dialog's own live preview (`validationStatusAtom`), which only
 * evaluates while that dialog is open with a draft rule.
 */
import type {
  DisplayCell,
  StaticSeedMatrix,
  StaticSpreadsheetSeed,
} from '@einfach/solid-excel/vnext'
import {
  validationMessageForRule,
  validationSeverityForMode,
  type ValidationMode,
  type ValidationRule,
} from '@einfach/spreadsheet-ui-core'

const qtyRule: ValidationRule = { kind: 'range', min: 1, max: 999, integerOnly: true }
const qtyMode: ValidationMode = 'reject'

const statusRule: ValidationRule = {
  kind: 'list',
  values: ['Pending', 'Shipped', 'Delivered', 'Cancelled'],
  dropdown: true,
}
const statusMode: ValidationMode = 'reject'

const discountRule: ValidationRule = { kind: 'range', min: 0, max: 100 }
const discountMode: ValidationMode = 'warn'

function flagged(
  row: number,
  col: number,
  displayValue: string,
  valueKind: DisplayCell['valueKind'],
  rule: ValidationRule,
  mode: ValidationMode,
): DisplayCell {
  return {
    row,
    col,
    displayValue,
    valueKind,
    validation: {
      code: `validation.${rule.kind}`,
      severity: validationSeverityForMode(mode),
      message: validationMessageForRule(rule),
    },
  }
}

const matrix: StaticSeedMatrix = [
  ['Order ID', 'Product', 'Qty', 'Unit Price', 'Status', 'Discount %'],
  ['ORD-1001', 'Wireless Mouse', 25, 19.99, 'Shipped', 10],
  ['ORD-1002', 'Mechanical Keyboard', 12, 79.5, 'Pending', 0],
  ['ORD-1003', 'USB-C Hub', 1500, 34, 'Delivered', 5],
  ['ORD-1004', 'Monitor Stand', 8, 45.25, 'Backordered', 15],
  ['ORD-1005', 'Webcam 1080p', 40, 29.99, 'Shipped', 125],
  ['ORD-1006', 'Laptop Sleeve', 60, 15, 'Delivered', 0],
  ['ORD-1007', 'Desk Lamp', 18, 22.75, 'Cancelled', 20],
  ['ORD-1008', 'Noise-Cancelling Headphones', 5, 129.99, 'Pending', 0],
  ['ORD-1009', 'Ergonomic Chair', 3, 249, 'Shipped', 10],
  ['ORD-1010', 'Cable Organizer', 90, 9.99, 'Delivered', 0],
]

// Three deliberate violations, each on a different row/column so they read
// as independent examples rather than one broken row. `flagged()` re-states
// the cell's own matrix value (row/col/displayValue/valueKind) because a
// `cells[]` entry replaces — not merges with — the matrix-derived cell at
// the same coordinate (see `buildState` in static-backend.ts).
const cells: DisplayCell[] = [
  // ORD-1003: Qty 1500 is above the 1-999 range rule.
  flagged(3, 2, '1500', 'number', qtyRule, qtyMode),
  // ORD-1004: "Backordered" is not one of the four allowed statuses.
  flagged(4, 4, 'Backordered', 'string', statusRule, statusMode),
  // ORD-1005: Discount 125% is above the 0-100 warn-only range rule.
  flagged(5, 5, '125', 'number', discountRule, discountMode),
]

export const dataValidationSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Order Form'],
  matrix,
  cells,
}
