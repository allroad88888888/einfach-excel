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
import {
  colorScaleFormat,
  colorScaleNumericValue,
  type ColorScaleDomains,
} from '../color-scale-projection'
import {
  dataBarNumericValue,
  dataBarProjection,
  type DataBarDomains,
  type DataBarProjection,
  withDataBarProjection,
} from '../data-bar-projection'
import { rangesIntersect } from './range-overlap'

const EMPTY_COLOR_SCALE_DOMAINS: ColorScaleDomains = new Map()
const EMPTY_DATA_BAR_DOMAINS: DataBarDomains = new Map()

interface ConditionalCellVisual {
  readonly conditionalFormat?: SpreadsheetCellFormat
  readonly dataBar?: DataBarProjection
}

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
    case 'color-scale':
      return colorScaleNumericValue(cell) !== null
    case 'data-bar':
      return dataBarNumericValue(cell) !== null
    case 'top-bottom':
      return numericValue(value) !== null
  }
}

// Expects `orderedRules` already sorted by priority — the sort is
// hoisted into `applyConditionalFormatOverlay` so a window read pays it
// once per overlay, not once per projected cell (audit D-11).
function getConditionalVisualForCell(
  row: number,
  col: number,
  cell: DisplayCell | undefined,
  orderedRules: readonly ConditionalFormatRuleEntry[],
  colorScaleDomains: ColorScaleDomains,
  dataBarDomains: DataBarDomains,
): ConditionalCellVisual | undefined {
  for (const entry of orderedRules) {
    if (!isCoordInsideRange(row, col, entry.scope.range)) continue
    if (!conditionalRuleAppliesToCell(entry.rule, cell)) continue
    if (entry.rule.kind === 'data-bar') {
      const dataBar = dataBarProjection(
        entry.rule,
        dataBarNumericValue(cell)!,
        dataBarDomains.get(entry.id),
      )
      return dataBar ? { dataBar } : {}
    }
    const format =
      entry.rule.kind === 'color-scale'
        ? colorScaleFormat(
            entry.rule,
            colorScaleNumericValue(cell)!,
            colorScaleDomains.get(entry.id),
          )
        : conditionalRuleFormat(entry.rule)
    if (format) return { conditionalFormat: format }
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
  colorScaleDomains: ColorScaleDomains = EMPTY_COLOR_SCALE_DOMAINS,
  dataBarDomains: DataBarDomains = EMPTY_DATA_BAR_DOMAINS,
): DisplayCell[] {
  if (rules.length === 0) return cells
  const ordered = rules
    .filter((entry) => rangesIntersect(entry.scope.range, window))
    .sort((left, right) => left.priority - right.priority)
  if (ordered.length === 0) return cells
  return cells.map((cell) => {
    const visual = getConditionalVisualForCell(
      cell.row,
      cell.col,
      cell,
      ordered,
      colorScaleDomains,
      dataBarDomains,
    )
    if (visual?.conditionalFormat) {
      const formatted = {
        ...cell,
        conditionalFormat: {
          ...(cell.conditionalFormat ? cloneFormat(cell.conditionalFormat) : {}),
          ...visual.conditionalFormat,
        },
      }
      return visual.dataBar ? withDataBarProjection(formatted, visual.dataBar) : formatted
    }
    return visual?.dataBar ? withDataBarProjection(cell, visual.dataBar) : cell
  })
}
