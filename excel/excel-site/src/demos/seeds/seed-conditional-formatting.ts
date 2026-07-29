/**
 * Seed data for the "conditional-formatting" demo — a sales-performance
 * tracker (region / rep / quarterly sales / growth %) plus two conditional
 * format rules registered against the Growth % column.
 *
 * The rules are applied through the real `backend.setConditionalFormatRule`
 * mutation port — the same call `SpreadsheetConditionalFormatDialog`'s Save
 * button makes (`excel/solid-excel/src-vnext/conditional-formatting/
 * SpreadsheetConditionalFormatDialog.tsx`) — rather than baking a static
 * `DisplayCell.conditionalFormat` override onto each cell the way
 * `VNextSmokeDemo.tsx` does. That distinction matters here: the static
 * backend recomputes a cell's conditional format from the rule + its
 * *current* value on every projection read
 * (`static-backend.ts`'s `getConditionalFormatForCell`), so a rule-based
 * seed is what makes "edit a value across the threshold and the color
 * flips" true. A baked-in per-cell override would just sit there, frozen,
 * no matter what the cell's value becomes.
 *
 * Threshold colors match Excel's built-in "Highlight Cells Rules" presets
 * (Light Green Fill w/ Dark Green Text, Light Red Fill w/ Dark Red Text).
 *
 * Trade-off worth knowing: unlike `matrix`, `setConditionalFormatRule` is a
 * real undoable mutation (`beginUndoableMutation` in static-backend.ts), so
 * these two seed calls occupy the first two slots of the undo stack —
 * pressing Cmd/Ctrl+Z twice right after load removes them. There is no
 * seed-level hook to register rules without going through the mutation
 * port: `StaticSpreadsheetSeed` has no `conditionalFormatRules` field, only
 * `revision` / `sheets` / `matrix` / `cells`.
 */
import type { StaticSeedMatrix, StaticSpreadsheetSeed } from '@einfach/solid-excel/vnext'
import type { SetConditionalFormatRuleRequest } from '@einfach/spreadsheet-ui-core'

/** `normalizeStaticSheets` assigns `sheet-${index + 1}` for a single string sheet name. */
export const CONDITIONAL_FORMATTING_SHEET_ID = 'sheet-1'

const matrix: StaticSeedMatrix = [
  ['Region', 'Rep', 'Q1 Sales', 'Q2 Sales', 'Q3 Sales', 'Q4 Sales', 'Growth %'],
  ['North', 'Ana Torres', 41200, 39800, 44500, 47600, 15],
  ['South', 'Marcus Webb', 28700, 26100, 24300, 22800, -12],
  ['East', 'Priya Shah', 52300, 55800, 58200, 61000, 18],
  ['West', 'Diego Cruz', 33400, 31900, 30200, 29100, -8],
  ['North', 'Elena Petrov', 39600, 41200, 43800, 45900, 11],
  ['South', 'Jamal Bakr', 24800, 23100, 21600, 20400, -15],
  ['East', 'Grace Lindqvist', 47100, 49300, 51800, 54200, 13],
  ['West', 'Owen Fitzgerald', 36200, 35100, 34400, 33800, -6],
  ['North', 'Sara Kim', 44800, 46200, 48900, 51300, 14],
  ['South', 'Tobias Reinholt', 30500, 29200, 27800, 26400, -10],
  ['East', 'Nadia Haddad', 55700, 58900, 61400, 64100, 19],
  ['West', 'Leo Marchetti', 32100, 33500, 34900, 36200, 6],
]

export const conditionalFormattingSeed: StaticSpreadsheetSeed = {
  revision: 1,
  sheets: ['Sales Performance'],
  matrix,
}

// Growth % is column 6 (0-indexed: Region, Rep, Q1..Q4, Growth %); rows 1-12
// are the 12 data rows (row 0 is the header).
const growthColumnScope = { range: { rowStart: 1, rowEnd: 12, colStart: 6, colEnd: 6 } }

/**
 * Double-digit growth (>10%) goes green, any decline (<0%) goes red.
 * `priority` is omitted on both — `setConditionalFormatRuleInState` assigns
 * `current.length` when absent, so applying these in order yields 0 then 1.
 */
export const conditionalFormattingRuleRequests: readonly SetConditionalFormatRuleRequest[] = [
  {
    kind: 'set-conditional-format-rule',
    sheetId: CONDITIONAL_FORMATTING_SHEET_ID,
    scope: growthColumnScope,
    rule: {
      kind: 'cell-value',
      operator: 'gt',
      value: '10',
      format: { bgColor: '#c6efce', fgColor: '#006100' },
    },
  },
  {
    kind: 'set-conditional-format-rule',
    sheetId: CONDITIONAL_FORMATTING_SHEET_ID,
    scope: growthColumnScope,
    rule: {
      kind: 'cell-value',
      operator: 'lt',
      value: '0',
      format: { bgColor: '#ffc7ce', fgColor: '#9c0006' },
    },
  },
]
