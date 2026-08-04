// 一句话：条件格式 overlay 向投影单元格的注入。

import type {
  CellRange,
  ConditionalFormatRule,
  ConditionalFormatRuleEntry,
  DisplayCell,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneFormat,
  compareCellValue,
  conditionalRuleFormat,
  isCoordInsideRange,
  numericValue,
} from '@einfach/spreadsheet-ui-core'
import { rangesIntersect } from './range-overlap'

function conditionalRuleAppliesToCell(
  rule: ConditionalFormatRule,
  cell: DisplayCell | undefined,
): boolean {
  const value = cell?.displayValue ?? ''
  switch (rule.kind) {
    case 'cell-value':
      return compareCellValue(value, rule.operator, rule.value, rule.value2)
    case 'formula':
      return rule.formula.trim().length > 0
    case 'data-bar':
    case 'color-scale':
    case 'top-bottom':
      return numericValue(value) !== null
  }
}

// Expects `orderedRules` already sorted by priority — the sort is
// hoisted into `applyConditionalFormatOverlay` so a window read pays it
// once per overlay, not once per projected cell (audit D-11).
function getConditionalFormatForCell(
  row: number,
  col: number,
  cell: DisplayCell | undefined,
  orderedRules: readonly ConditionalFormatRuleEntry[],
): SpreadsheetCellFormat | undefined {
  for (const entry of orderedRules) {
    if (!isCoordInsideRange(row, col, entry.scope.range)) continue
    if (!conditionalRuleAppliesToCell(entry.rule, cell)) continue
    const format = conditionalRuleFormat(entry.rule)
    if (format) return format
  }
  return undefined
}

// Exported for the audit D-11 pin in test/audit-adapter-scaling.test.ts.
//
// `window` is the canonical requested range and bounds every (row, col)
// coordinate the per-cell loop can test. Rules scoped entirely
// outside it can never match, so they are dropped BEFORE the per-cell
// loop (audit D-11, second half). The pre-filter is a pure superset
// test: per-cell `isCoordInsideRange` still decides membership for the
// surviving rules, and unbounded scopes (whole-column / whole-sheet)
// intersect any window in their band, so they always survive.
export function applyConditionalFormatOverlay(
  cells: DisplayCell[],
  rules: readonly ConditionalFormatRuleEntry[],
  window: CellRange,
): DisplayCell[] {
  if (rules.length === 0) return cells
  const ordered = rules
    .filter((entry) => rangesIntersect(entry.scope.range, window))
    .sort((left, right) => left.priority - right.priority)
  if (ordered.length === 0) return cells
  return cells.map((cell) => {
    const conditionalFormat = getConditionalFormatForCell(cell.row, cell.col, cell, ordered)
    if (!conditionalFormat) return cell
    return {
      ...cell,
      conditionalFormat: {
        ...(cell.conditionalFormat ? cloneFormat(cell.conditionalFormat) : {}),
        ...conditionalFormat,
      },
    }
  })
}
