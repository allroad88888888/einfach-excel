import { isObjectRecord, isOneOf, snapshotFormat } from '../conditional-formatting/snapshot-format'
import type { DuplicateValuesRule, TextMatchRule } from '../conditional-formatting/types'

/** Decode wire fields only. Rust remains the sole text matcher and duplicate-key authority. */
export function snapshotAdvancedFormattingRule(
  value: unknown,
): TextMatchRule | DuplicateValuesRule | null {
  if (!isObjectRecord(value)) return null
  const format = snapshotFormat(value.format)
  if (!format || (value.enabled !== undefined && typeof value.enabled !== 'boolean') ||
    (value.stopIfTrue !== undefined && typeof value.stopIfTrue !== 'boolean')) return null
  const options = {
    ...(value.enabled === undefined ? {} : { enabled: value.enabled as boolean }),
    ...(value.stopIfTrue === undefined ? {} : { stopIfTrue: value.stopIfTrue as boolean }),
  }
  if (value.kind === 'text') {
    return typeof value.text === 'string' && isOneOf(value.condition, [
      'contains', 'not-contains', 'begins-with', 'ends-with',
      'matches-wildcard', 'not-matches-wildcard',
    ] as const) ? { ...options, kind: 'text', condition: value.condition, text: value.text, format } : null
  }
  if (value.kind !== 'duplicate-values' || !isOneOf(value.mode, ['duplicate', 'unique'] as const) ||
    (value.compareBy !== undefined && !isOneOf(value.compareBy, ['value', 'display-text'] as const))) return null
  return { ...options, kind: 'duplicate-values', mode: value.mode, format,
    ...(value.compareBy === undefined ? {} : { compareBy: value.compareBy as 'value' | 'display-text' }) }
}
