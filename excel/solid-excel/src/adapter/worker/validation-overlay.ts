// 一句话：数据校验 overlay 向投影单元格的注入。

import type {
  CellRange,
  DisplayCell,
  ValidationMode,
  ValidationRule,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneCell,
  evaluateValidationLocal,
  isCoordInsideRange,
  keyFor,
  validationMessageForRule,
  validationSeverityForMode,
} from '@einfach/spreadsheet-ui-core'
import { rangesIntersect } from './range-overlap'

export function cloneValidationRule(rule: ValidationRule): ValidationRule {
  return rule.kind === 'list' ? { ...rule, values: [...rule.values] } : { ...rule }
}

export type WorkerValidationRuleLayer = {
  range: CellRange
  rule: ValidationRule
  mode: ValidationMode
}

/**
 * `range` is the coordinate space the rule ranges are compared against. It is
 * now unambiguously the requested window: rule scopes are SOURCE facts and
 * projected rows are source rows, so the old double meaning (display window on
 * the plain path, source bounding box under an active filter) is gone along
 * with the `mappedRows` branch that reconciled the two.
 */
export function applyValidationOverlay(
  cells: DisplayCell[],
  range: CellRange,
  rules: readonly WorkerValidationRuleLayer[],
): DisplayCell[] {
  if (rules.length === 0) return cells
  const byDisplay = new Map(cells.map((cell) => [keyFor(cell.row, cell.col), cloneCell(cell)]))

  for (const layer of rules) {
    if (!rangesIntersect(layer.range, range)) continue

    for (const cell of byDisplay.values()) {
      if (!isCoordInsideRange(cell.row, cell.col, layer.range)) continue
      const outcome = evaluateValidationLocal(layer.rule, cell.displayValue)
      const severity = validationSeverityForMode(layer.mode)
      cell.validation = outcome
        ? { ...outcome, severity }
        : {
            code: `validation.${layer.rule.kind}`,
            severity,
            message: validationMessageForRule(layer.rule),
          }
    }

    const colStart = Math.max(range.colStart, layer.range.colStart)
    const colEnd = Math.min(range.colEnd, layer.range.colEnd)
    const blankValidation = () => ({
      code: `validation.${layer.rule.kind}`,
      severity: validationSeverityForMode(layer.mode),
      message: validationMessageForRule(layer.rule),
    })

    const rowStart = Math.max(range.rowStart, layer.range.rowStart)
    const rowEnd = Math.min(range.rowEnd, layer.range.rowEnd)
    for (let row = rowStart; row <= rowEnd; row += 1) {
      for (let col = colStart; col <= colEnd; col += 1) {
        const key = keyFor(row, col)
        if (byDisplay.has(key)) continue
        byDisplay.set(key, {
          row,
          col,
          displayValue: '',
          valueKind: 'blank',
          validation: blankValidation(),
        })
      }
    }
  }
  return [...byDisplay.values()]
}
