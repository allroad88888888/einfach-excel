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
} from '../data-bar-projection'
import { topBottomNumericValue, type TopBottomMatches } from '../top-bottom-projection'
import type { StaticBackendState } from './state'

const EMPTY_COLOR_SCALE_DOMAINS: ColorScaleDomains = new Map()
const EMPTY_DATA_BAR_DOMAINS: DataBarDomains = new Map()
const EMPTY_TOP_BOTTOM_MATCHES: TopBottomMatches = new Map()

export interface ConditionalCellVisual {
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
      return topBottomNumericValue(cell) !== null
  }
}

export function getConditionalVisualForCell(
  row: number,
  col: number,
  cell: DisplayCell | undefined,
  rules: readonly ConditionalFormatRuleEntry[],
  colorScaleDomains: ColorScaleDomains = EMPTY_COLOR_SCALE_DOMAINS,
  dataBarDomains: DataBarDomains = EMPTY_DATA_BAR_DOMAINS,
  topBottomMatches: TopBottomMatches = EMPTY_TOP_BOTTOM_MATCHES,
): ConditionalCellVisual | undefined {
  const ordered = [...rules].sort((left, right) => left.priority - right.priority)
  for (const entry of ordered) {
    if (!isCoordInsideRange(row, col, entry.scope.range)) continue
    if (!conditionalRuleAppliesToCell(entry.rule, cell)) continue
    if (entry.rule.kind === 'top-bottom' && !topBottomMatches.get(entry.id)?.has(`${row}:${col}`)) {
      continue
    }
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

export function getConditionalFormatForCell(
  row: number,
  col: number,
  cell: DisplayCell | undefined,
  rules: readonly ConditionalFormatRuleEntry[],
  colorScaleDomains: ColorScaleDomains = EMPTY_COLOR_SCALE_DOMAINS,
  topBottomMatches: TopBottomMatches = EMPTY_TOP_BOTTOM_MATCHES,
): SpreadsheetCellFormat | undefined {
  return getConditionalVisualForCell(
    row,
    col,
    cell,
    rules,
    colorScaleDomains,
    EMPTY_DATA_BAR_DOMAINS,
    topBottomMatches,
  )?.conditionalFormat
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
