import type { ColumnFilterGroup, ColumnFilterRule } from '../filter-sort/types'

export const maxFilterSelectionBytes = 1_048_576
const bytes = new TextEncoder()
export function filterSelectionWithinBudget(values: readonly string[]): boolean {
  return values.length <= 1000 && values.every((value) => value.length <= 32767) &&
    values.reduce((sum, value) => sum + bytes.encode(value).length + 24, 0)
      <= maxFilterSelectionBytes
}

/** Leaf validation only; no TypeScript cell matching or duplicated engine predicate. */
export function validFilterCondition(rule: ColumnFilterRule, columns: number): boolean {
  if (!rule || !Number.isSafeInteger(rule.colIndex) || rule.colIndex < 0 ||
    rule.colIndex >= columns)
    return false
  if (rule.kind === 'equals' || rule.kind === 'contains')
    return typeof rule.value === 'string' && rule.value.length <= 32767 &&
      (rule.caseSensitive === undefined || typeof rule.caseSensitive === 'boolean')
  // Persisted flat lists predate selection byte budgets; keep their original shape limit.
  if (rule.kind === 'list') return Array.isArray(rule.values) && rule.values.length <= 1000 &&
    rule.values.every((value: unknown) => typeof value === 'string' && value.length <= 32767)
  return rule.kind === 'range' && (rule.min !== undefined || rule.max !== undefined) &&
    (rule.min === undefined || Number.isFinite(rule.min)) &&
    (rule.max === undefined || Number.isFinite(rule.max)) &&
    (rule.min === undefined || rule.max === undefined || rule.min <= rule.max)
}

export function validFilterGroups(
  value: unknown, columns = 16_384,
): value is readonly ColumnFilterGroup[] {
  if (!Array.isArray(value) || value.length > 8) return false
  let count = 0
  let payloadBytes = 0
  return value.every((group: ColumnFilterGroup) => {
    if (!group || !Array.isArray(group.rules) || !group.rules.length ||
      group.rules.length > 8) return false
    count += group.rules.length
    return count <= 32 && group.rules.every((rule) => {
      if (!validFilterCondition(rule, columns) ||
        (rule.kind === 'list' && !filterSelectionWithinBudget(rule.values))) return false
      const strings = 'value' in rule ? [rule.value] : rule.kind === 'list' ? rule.values : []
      payloadBytes += 128 + strings.reduce((sum: number, text: string) =>
        sum + bytes.encode(text).length + 24, 0)
      return payloadBytes <= 8 * maxFilterSelectionBytes
    })
  })
}
