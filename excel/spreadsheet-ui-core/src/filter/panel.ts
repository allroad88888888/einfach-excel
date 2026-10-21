import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { ColumnFilterRule } from '../filter-sort/types'
import { validFilterRules } from '../rust-workbook/filter-commands'
import { nativeFilterGroupsAtom, nativeFilterTargetAtom, nativeTableFiltersAtom } from './scope'
import { draftGroups, conditionRule, ruleCondition } from '../advanced-filter/groups'
import { validFilterGroups } from '../advanced-filter/contracts'
import { projectionSnapshotAtom } from '../projection/state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import {
  filterCondition as condition, filterPanelStateAtom as stateAtom,
  initialFilterPanel as initial, type FilterCondition as Condition,
} from './panel-state'
import {
  nativeFilterFeedbackAtom,
  nativeFilterRangeAtom,
  nativeFilterRulesAtom,
  runNativeFilterAtom,
} from './command'

export const nativeFilterPanelAtom = atom((get) => {
  const state = get(stateAtom)
  const rules = state.table
    ? get(nativeTableFiltersAtom).find((target) => target.table === state.table)?.rules ?? []
    : get(nativeFilterRulesAtom)
  return { ...state, rules }
})
type Action =
  | 'open'
  | 'close'
  | 'apply'
  | 'add'
  | 'clear-column'
  | 'clear'
  | 'reapply'
  | { type: 'open-column'; col: number; table?: string }
  | { type: 'remove'; index: number }
  | { type: 'change'; index: number; patch: Partial<Condition> }

/** 草稿仅在面板打开期间存在，重新打开直接读取 Rust 投影中的已提交条件。 */
export const configureNativeFilterAtom = atom(
  null,
  async (get, set, action: Action): Promise<boolean> => {
    if (get(nativeFilterFeedbackAtom).busy) return false
    const state = get(stateAtom)
    if (action === 'apply' && state.browser?.busy) return false
    const sheet = get(activeWorkbookSheetAtom)
    if (action === 'close') {
      set(stateAtom, initial)
      return true
    }
    if (!sheet) return false
    if (action === 'clear' || action === 'reapply') {
      const target = get(nativeFilterTargetAtom)
      return set(runNativeFilterAtom, { action, ...(target.table ? { table: target.table } : {}) })
    }
    if (action === 'open' || (typeof action === 'object' && action.type === 'open-column')) {
      const target = action === 'open' ? get(nativeFilterTargetAtom)
        : action.table ? get(nativeTableFiltersAtom).find((entry) => entry.table === action.table)
          : { table: undefined, range: get(nativeFilterRangeAtom),
              rules: get(nativeFilterRulesAtom), groups: get(nativeFilterGroupsAtom) }
      if (!target) return false
      const { range, table } = target
      // A column-only editor cannot safely preserve OR branches. Open the complete
      // group draft for an already grouped filter, retaining every other condition.
      const column = typeof action === 'object' && !target.groups.length ? action.col : undefined
      if (column !== undefined && (!range || column < range.colStart || column > range.colEnd))
        return false
      const rules = target.rules.filter(
        (rule) => column === undefined || rule.colIndex === column,
      )
      set(stateAtom, {
        sheetId: sheet.id,
        connection: get(rustWorkbookConnectionAtom),
        table,
        revision: get(projectionSnapshotAtom).result?.revision,
        range,
        column,
        browser: undefined,
        error: '',
        advanced: target.groups.length > 0,
        conditions: target.groups.length
          ? target.groups.flatMap((group, index) =>
              group.rules.map((rule) => ruleCondition(rule, index)))
          : rules.length
          ? rules.map((rule) => ({
              ...condition(rule.colIndex),
              kind: rule.kind,
              ...('value' in rule
                ? { value: rule.value, caseSensitive: !!rule.caseSensitive }
                : {}),
              ...(rule.kind === 'range'
                ? { min: rule.min?.toString() ?? '', max: rule.max?.toString() ?? '' }
                : {}),
              ...(rule.kind === 'list' ? { values: rule.values } : {}),
            }))
          : [
              condition(
                column ??
                  Math.max(
                    range?.colStart ?? 0,
                    Math.min(
                      get(selectionSnapshotAtom).activeCell.col,
                      range?.colEnd ?? sheet.colCount - 1,
                    ),
                  ),
              ),
            ],
      })
      return true
    }
    if (state.sheetId !== sheet.id || state.connection !== get(rustWorkbookConnectionAtom)) {
      set(stateAtom, { ...state, error: 'The worksheet changed. Close and reopen Filter.' })
      return false
    }
    if (state.revision !== get(projectionSnapshotAtom).result?.revision ||
      (state.table && !get(nativeTableFiltersAtom)
        .some((target) => target.table === state.table))) {
      const target = state.table ? 'table' : 'worksheet'
      set(stateAtom, { ...state, error: `The ${target} changed. Close and reopen Filter.` })
      return false
    }
    if (action === 'add') {
      const used = new Set(state.conditions.map((item) => item.col))
      let col = state.range?.colStart ?? 0
      while (used.has(col)) col++
      if (
        state.column !== undefined ||
        col > (state.range?.colEnd ?? sheet.colCount - 1) ||
        state.conditions.length >= 8
      )
        return false
      set(stateAtom, { ...state, error: '', conditions: [...state.conditions, condition(col)] })
      return true
    }
    if (typeof action === 'object') {
      if (
        !state.conditions[action.index] ||
        (action.type === 'remove' && state.conditions.filter((item) =>
          (item.group ?? 0) === (state.conditions[action.index]!.group ?? 0)).length === 1)
      )
        return false
      set(stateAtom, {
        ...state,
        error: '',
        browser: undefined,
        conditions:
          action.type === 'remove'
            ? state.conditions.filter((_, index) => index !== action.index)
            : state.conditions.map((item, index) =>
                index === action.index ? { ...item, ...action.patch } : item,
              ),
      })
      return true
    }
    let rules: ColumnFilterRule[] = state.conditions.map(conditionRule)
    if (state.column !== undefined) {
      rules = [
        ...get(nativeFilterPanelAtom).rules.filter((rule) => rule.colIndex !== state.column),
        ...(action === 'clear-column' ? [] : rules),
      ]
    }
    const groups = state.advanced ? draftGroups(state.conditions) : undefined
    if (groups ? !validFilterGroups(groups, sheet.colCount)
      : !validFilterRules(rules, sheet.colCount)) {
      set(stateAtom, {
        ...state,
        error: groups ? 'Use nonempty groups and valid numbers; minimum cannot exceed maximum.'
          : 'Use different columns and valid numbers; minimum cannot exceed maximum.',
      })
      return false
    }
    const completed = await set(runNativeFilterAtom, {
      action: 'apply',
      rules: groups ? [] : rules,
      ...(groups ? { groups } : {}),
      ...(state.table ? { table: state.table } : state.range ? { range: state.range } : {}),
    })
    if (get(stateAtom) !== state || get(rustWorkbookConnectionAtom) !== state.connection)
      return false
    if (completed) set(stateAtom, initial)
    else
      set(stateAtom, {
        ...state,
        error: get(nativeFilterFeedbackAtom).error || 'Filter was not applied. Try again.',
      })
    return completed
  },
)
