import { atom } from '@einfach/core'
import type { ColumnFilterGroup, ColumnFilterRule } from '../filter-sort/types'
import { filterPanelStateAtom, type FilterCondition } from '../filter/panel-state'

export const nativeAdvancedFilterGroupsAtom = atom((get) => {
  const state = get(filterPanelStateAtom)
  const groups = new Map<number, { index: number; condition: FilterCondition }[]>()
  state.conditions.forEach((condition, index) => {
    const group = condition.group ?? 0
    groups.set(group, [...(groups.get(group) ?? []), { index, condition }])
  })
  return [...groups.entries()].map(([group, conditions]) => ({ group, conditions }))
})

export function conditionRule(item: FilterCondition): ColumnFilterRule {
  const colIndex = item.col
  if (item.kind === 'range') return { kind: 'range', colIndex,
    ...(item.min.trim() ? { min: Number(item.min) } : {}),
    ...(item.max.trim() ? { max: Number(item.max) } : {}) }
  if (item.kind === 'list') return { kind: 'list', colIndex, values: item.values }
  return { kind: item.kind, colIndex, value: item.value, caseSensitive: item.caseSensitive }
}

export function draftGroups(conditions: readonly FilterCondition[]): ColumnFilterGroup[] {
  const groups = new Map<number, ColumnFilterRule[]>()
  for (const condition of conditions) {
    const group = condition.group ?? 0
    groups.set(group, [...(groups.get(group) ?? []), conditionRule(condition)])
  }
  return [...groups.values()].map((rules) => ({ rules }))
}

export function ruleCondition(rule: ColumnFilterRule, group: number): FilterCondition {
  return { group, col: rule.colIndex, kind: rule.kind,
    value: 'value' in rule ? rule.value : '', caseSensitive: 'caseSensitive' in rule && !!rule.caseSensitive,
    min: rule.kind === 'range' ? rule.min?.toString() ?? '' : '',
    max: rule.kind === 'range' ? rule.max?.toString() ?? '' : '',
    values: rule.kind === 'list' ? rule.values : [''] }
}
