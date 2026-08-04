import { CONDITIONAL_FORMAT_RULES_MAX } from './constants'
import { isObjectRecord, isOneOf, snapshotFormat, snapshotRevision, snapshotScope } from './snapshot-format'
import type { ConditionalFormatRule, ConditionalFormatRuleEntry, ConditionalFormatRulesState } from './types'

export function snapshotRule(value: unknown): ConditionalFormatRule | null {
  if (!isObjectRecord(value)) return null
  try {
    switch (value.kind) {
      case 'cell-value': {
        const format = snapshotFormat(value.format)
        if (!isOneOf(value.operator, ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'between', 'not-between'] as const) || typeof value.value !== 'string' || (value.value2 !== undefined && typeof value.value2 !== 'string') || format === null) return null
        return { kind: value.kind, operator: value.operator, value: value.value, ...(value.value2 === undefined ? {} : { value2: value.value2 }), format }
      }
      case 'formula': {
        const format = snapshotFormat(value.format)
        return typeof value.formula === 'string' && format !== null ? { kind: value.kind, formula: value.formula, format } : null
      }
      case 'data-bar':
        return (value.minColor !== undefined && typeof value.minColor !== 'string') || (value.maxColor !== undefined && typeof value.maxColor !== 'string') ? null : { kind: value.kind, ...(value.minColor === undefined ? {} : { minColor: value.minColor }), ...(value.maxColor === undefined ? {} : { maxColor: value.maxColor }) }
      case 'color-scale':
        return typeof value.minColor !== 'string' || typeof value.maxColor !== 'string' || (value.midColor !== undefined && typeof value.midColor !== 'string') ? null : { kind: value.kind, minColor: value.minColor, ...(value.midColor === undefined ? {} : { midColor: value.midColor }), maxColor: value.maxColor }
      case 'top-bottom': {
        const format = snapshotFormat(value.format)
        if ((value.direction !== 'top' && value.direction !== 'bottom') || typeof value.count !== 'number' || !Number.isFinite(value.count) || (value.percent !== undefined && typeof value.percent !== 'boolean') || format === null) return null
        return { kind: value.kind, direction: value.direction, count: value.count, ...(value.percent === undefined ? {} : { percent: value.percent }), format }
      }
      default: return null
    }
  } catch { return null }
}

export function snapshotEntry(value: unknown): ConditionalFormatRuleEntry | null {
  if (!isObjectRecord(value)) return null
  try {
    const scope = snapshotScope(value.scope)
    const rule = snapshotRule(value.rule)
    if (typeof value.id !== 'string' || typeof value.priority !== 'number' || !Number.isFinite(value.priority) || scope === null || rule === null) return null
    return { id: value.id, priority: value.priority, scope, rule }
  } catch { return null }
}

export function snapshotRulesState(value: unknown): ConditionalFormatRulesState | null {
  if (!isObjectRecord(value)) return null
  try {
    const revision = snapshotRevision(value.revision)
    if ((value.sheetId !== null && typeof value.sheetId !== 'string') || !Array.isArray(value.rules) || !revision.ok) return null
    const rules: ConditionalFormatRuleEntry[] = []
    for (const ruleValue of [...value.rules]) {
      const rule = snapshotEntry(ruleValue)
      if (rule === null) return null
      rules.push(rule)
    }
    return {
      sheetId: value.sheetId,
      rules: rules.length > CONDITIONAL_FORMAT_RULES_MAX ? rules.slice(-CONDITIONAL_FORMAT_RULES_MAX) : rules,
      ...(revision.value === undefined ? {} : { revision: revision.value }),
    }
  } catch { return null }
}
