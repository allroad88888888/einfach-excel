// 一句话：条件格式规则的匹配与注册表维护。

import type {
  ConditionalFormatRule,
  ConditionalFormatRuleEntry,
  DisplayCell,
  RemoveConditionalFormatRuleRequest,
  SetConditionalFormatRuleRequest,
  SpreadsheetCellFormat,
} from '@einfach/spreadsheet-ui-core'
import {
  cloneConditionalFormatRule,
  cloneConditionalFormatRuleEntry,
  cloneRange,
  compareCellValue,
  conditionalRuleFormat,
  isCoordInsideRange,
  nextConditionalFormatRuleId,
  normalizeRange,
  numericValue,
} from '@einfach/spreadsheet-ui-core'
import type { StaticBackendState } from './state'

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

export function getConditionalFormatForCell(
  row: number,
  col: number,
  cell: DisplayCell | undefined,
  rules: readonly ConditionalFormatRuleEntry[],
): SpreadsheetCellFormat | undefined {
  const ordered = [...rules].sort((left, right) => left.priority - right.priority)
  for (const entry of ordered) {
    if (!isCoordInsideRange(row, col, entry.scope.range)) continue
    if (!conditionalRuleAppliesToCell(entry.rule, cell)) continue
    const format = conditionalRuleFormat(entry.rule)
    if (format) return format
  }
  return undefined
}

export function listConditionalFormatRulesForSheet(
  state: StaticBackendState,
  sheetId: string,
): ConditionalFormatRuleEntry[] {
  return (state.conditionalFormatRulesBySheetId.get(sheetId) ?? [])
    .map(cloneConditionalFormatRuleEntry)
    .sort((left, right) => left.priority - right.priority)
}

export function setConditionalFormatRuleInState(
  state: StaticBackendState,
  request: SetConditionalFormatRuleRequest,
): ConditionalFormatRuleEntry {
  const current = state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? []
  const existingIndex = request.ruleId
    ? current.findIndex((entry) => entry.id === request.ruleId)
    : -1
  const entry: ConditionalFormatRuleEntry = {
    id:
      existingIndex >= 0
        ? current[existingIndex].id
        : (request.ruleId ?? nextConditionalFormatRuleId(current)),
    scope: { range: cloneRange(normalizeRange(request.scope.range)) },
    priority:
      request.priority ?? (existingIndex >= 0 ? current[existingIndex].priority : current.length),
    rule: cloneConditionalFormatRule(request.rule),
  }
  const next =
    existingIndex >= 0
      ? current.map((item, index) => (index === existingIndex ? entry : item))
      : [...current, entry]
  state.conditionalFormatRulesBySheetId.set(
    request.sheetId,
    next.map((item, index) => ({ ...item, priority: item.priority ?? index })),
  )
  return cloneConditionalFormatRuleEntry(entry)
}

export function removeConditionalFormatRuleFromState(
  state: StaticBackendState,
  request: RemoveConditionalFormatRuleRequest,
): boolean {
  const current = state.conditionalFormatRulesBySheetId.get(request.sheetId) ?? []
  const next = current.filter((entry) => entry.id !== request.ruleId)
  state.conditionalFormatRulesBySheetId.set(request.sheetId, next)
  return next.length !== current.length
}
