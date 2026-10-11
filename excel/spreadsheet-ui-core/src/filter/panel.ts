import { atom } from '@einfach/core'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { selectionSnapshotAtom } from '../selection'
import type { ColumnFilterRule } from '../filter-sort/types'
import type { CellRange } from '../shared'
import { validFilterRules } from '../rust-workbook/filter-commands'
import { nativeFilterTargetAtom, nativeTableFiltersAtom } from './scope'
import { projectionSnapshotAtom } from '../projection/state'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import type { RustWorkbookConnection } from '../rust-workbook/commands'
import type { ProjectionRevision } from '../backend'
import {
  nativeFilterFeedbackAtom,
  nativeFilterRangeAtom,
  nativeFilterRulesAtom,
  runNativeFilterAtom,
} from './command'

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
  connection: null as RustWorkbookConnection | null,
  table: undefined as string | undefined,
  revision: undefined as ProjectionRevision | undefined,
  range: undefined as CellRange | undefined,
  column: undefined as number | undefined,
  conditions: [] as readonly Condition[],
  error: '',
}
const stateAtom = atom(initial)
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
              rules: get(nativeFilterRulesAtom) }
      if (!target) return false
      const { range, table } = target
      const column = typeof action === 'object' ? action.col : undefined
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
    if (state.table && (state.revision !== get(projectionSnapshotAtom).result?.revision ||
      !get(nativeTableFiltersAtom).some((target) => target.table === state.table))) {
      set(stateAtom, { ...state, error: 'The table changed. Close and reopen Filter.' })
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
    let rules: ColumnFilterRule[] = state.conditions.map((item) => {
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
    if (state.column !== undefined) {
      rules = [
        ...get(nativeFilterPanelAtom).rules.filter((rule) => rule.colIndex !== state.column),
        ...(action === 'clear-column' ? [] : rules),
      ]
    }
    if (!validFilterRules(rules, sheet.colCount)) {
      set(stateAtom, {
        ...state,
        error: 'Use different columns and valid numbers; minimum cannot exceed maximum.',
      })
      return false
    }
    const completed = await set(runNativeFilterAtom, {
      action: 'apply',
      rules,
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
