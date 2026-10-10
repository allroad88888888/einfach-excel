import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { ColumnFilterRule } from '../filter-sort/types'
import { validFilterRules } from '../rust-workbook/filter-commands'
import { nativeFilterFeedbackAtom, nativeFilterRulesAtom, runNativeFilterAtom } from './command'

interface Condition {
  col: number
  kind: ColumnFilterRule['kind']
  value: string
  min: string
  max: string
  caseSensitive: boolean
}
const condition = (col: number): Condition => ({
  col,
  kind: 'equals',
  value: '',
  min: '',
  max: '',
  caseSensitive: false,
})
const initial = {
  sheetId: null as string | null,
  conditions: [] as readonly Condition[],
  error: '',
}
const stateAtom = atom(initial)
export const nativeFilterPanelAtom = atom((get) => get(stateAtom))
type Action =
  | 'open'
  | 'close'
  | 'apply'
  | 'add'
  | { type: 'remove'; index: number }
  | { type: 'change'; index: number; patch: Partial<Condition> }

/** 草稿仅在面板打开期间存在，重新打开直接读取 Rust 投影中的已提交条件。 */
export const configureNativeFilterAtom = atom(
  null,
  async (get, set, action: Action): Promise<boolean> => {
    if (get(nativeFilterFeedbackAtom).busy) return false
    const state = get(stateAtom)
    const sheet = get(activeWorkbookSheetAtom)
    if (action === 'close') {
      set(stateAtom, initial)
      return true
    }
    if (!sheet) return false
    if (action === 'open') {
      const rules = get(nativeFilterRulesAtom)
      set(stateAtom, {
        sheetId: sheet.id,
        error: '',
        conditions: rules.length
          ? rules.map((rule) => ({
              ...condition(rule.colIndex),
              kind: rule.kind,
              ...('value' in rule
                ? { value: rule.value, caseSensitive: !!rule.caseSensitive }
                : {}),
              ...(rule.kind === 'range'
                ? { min: rule.min?.toString() ?? '', max: rule.max?.toString() ?? '' }
                : {}),
              ...(rule.kind === 'list' ? { value: rule.values.join('\n') } : {}),
            }))
          : [condition(get(selectionSnapshotAtom).activeCell.col)],
      })
      return true
    }
    if (state.sheetId !== sheet.id) {
      set(stateAtom, { ...state, error: 'The worksheet changed. Close and reopen Filter.' })
      return false
    }
    if (action === 'add') {
      const used = new Set(state.conditions.map((item) => item.col))
      let col = 0
      while (used.has(col)) col++
      if (col >= sheet.colCount || state.conditions.length >= 8) return false
      set(stateAtom, { ...state, error: '', conditions: [...state.conditions, condition(col)] })
      return true
    }
    if (typeof action === 'object') {
      if (
        !state.conditions[action.index] ||
        (action.type === 'remove' && state.conditions.length === 1)
      )
        return false
      set(stateAtom, {
        ...state,
        error: '',
        conditions:
          action.type === 'remove'
            ? state.conditions.filter((_, index) => index !== action.index)
            : state.conditions.map((item, index) =>
                index === action.index ? { ...item, ...action.patch } : item,
              ),
      })
      return true
    }
    const rules: ColumnFilterRule[] = state.conditions.map((item) => {
      const colIndex = item.col
      if (item.kind === 'range')
        return {
          kind: 'range',
          colIndex,
          ...(item.min.trim() ? { min: Number(item.min) } : {}),
          ...(item.max.trim() ? { max: Number(item.max) } : {}),
        }
      if (item.kind === 'list') return { kind: 'list', colIndex, values: item.value.split('\n') }
      return { kind: item.kind, colIndex, value: item.value, caseSensitive: item.caseSensitive }
    })
    if (!validFilterRules(rules, sheet.colCount)) {
      set(stateAtom, {
        ...state,
        error: 'Use different columns and valid numbers; minimum cannot exceed maximum.',
      })
      return false
    }
    const completed = await set(runNativeFilterAtom, { action: 'apply', rules })
    if (completed) set(stateAtom, initial)
    else
      set(stateAtom, {
        ...state,
        error: get(nativeFilterFeedbackAtom).error || 'Filter was not applied. Try again.',
      })
    return completed
  },
)
