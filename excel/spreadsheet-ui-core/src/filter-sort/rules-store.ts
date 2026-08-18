import { MAX_FILTER_LIST_VALUES, MAX_FILTER_SORT_SHEETS } from './constants'
import type { ColumnFilterRule, FilterSortState } from './types'
import type { FilterSortStateStore } from './internal-types'

export const EMPTY_FILTER_SORT_STATE: FilterSortState = Object.freeze({ rules: Object.freeze([]) })
export const EMPTY_FILTER_SORT_STATE_BY_SHEET = Object.freeze({})
export const EMPTY_FILTER_SORT_STATE_STORE: FilterSortStateStore = Object.freeze({
  stateBySheet: EMPTY_FILTER_SORT_STATE_BY_SHEET,
  insertionOrder: Object.freeze([]),
})

export function normalizeRules(rules: readonly ColumnFilterRule[]): readonly ColumnFilterRule[] {
  return Object.freeze(
    rules.map((rule) =>
      rule.kind !== 'list'
        ? Object.freeze({ ...rule })
        : Object.freeze({
            ...rule,
            values: Object.freeze(rule.values.slice(0, MAX_FILTER_LIST_VALUES)),
          }),
    ),
  )
}

export const normalizeState = (state: FilterSortState): FilterSortState =>
  Object.freeze({ rules: normalizeRules(state.rules) })

export function stateStoreWith(
  current: FilterSortStateStore,
  sheetId: string,
  state: FilterSortState,
): FilterSortStateStore {
  const exists = Object.prototype.hasOwnProperty.call(current.stateBySheet, sheetId)
  const bySheet = { ...current.stateBySheet }
  let order = current.insertionOrder
  if (!exists) {
    const oldest = order[0]
    if (order.length >= MAX_FILTER_SORT_SHEETS && oldest !== undefined) {
      delete bySheet[oldest]
      order = Object.freeze([...order.slice(1), sheetId])
    } else order = Object.freeze([...order, sheetId])
  }
  return Object.freeze({
    stateBySheet: Object.freeze({
      ...bySheet,
      [sheetId]: Object.freeze({ rules: normalizeRules(state.rules) }),
    }),
    insertionOrder: order,
  })
}

export function stateStoreWithout(
  current: FilterSortStateStore,
  sheetId: string,
): FilterSortStateStore {
  if (!Object.prototype.hasOwnProperty.call(current.stateBySheet, sheetId)) return current
  const bySheet = { ...current.stateBySheet }
  delete bySheet[sheetId]
  return Object.freeze({
    stateBySheet: Object.freeze(bySheet),
    insertionOrder: Object.freeze(current.insertionOrder.filter((id) => id !== sheetId)),
  })
}
