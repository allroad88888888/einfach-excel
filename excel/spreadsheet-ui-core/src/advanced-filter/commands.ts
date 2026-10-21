import { atom } from '@einfach/core'
import { filterCondition, filterPanelStateAtom } from '../filter/panel-state'
import { nativeFilterFeedbackAtom } from '../filter/command'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { rustWorkbookConnectionAtom } from '../runtime/workbook-connection'
import { projectionSnapshotAtom } from '../projection/state'

export type AdvancedFilterAction = 'add-group' |
  { readonly type: 'remove-group' | 'add-condition'; readonly group: number }

/** Group editing is a draft transition; Apply stays the existing single native command. */
export const configureAdvancedFilterAtom = atom(null, (
  get, set, action: AdvancedFilterAction,
): boolean => {
  const state = get(filterPanelStateAtom)
  const sheet = get(activeWorkbookSheetAtom)
  if (get(nativeFilterFeedbackAtom).busy || state.browser?.busy || !state.sheetId || !sheet ||
    state.sheetId !== sheet.id || state.connection !== get(rustWorkbookConnectionAtom) ||
    state.revision !== get(projectionSnapshotAtom).result?.revision ||
    state.column !== undefined) return false
  const groups = [...new Set(state.conditions.map((item) => item.group ?? 0))]
  let conditions = state.conditions
  if (action === 'add-group') {
    if (groups.length >= 8 || conditions.length >= 32) return false
    const group = Math.max(-1, ...groups) + 1
    conditions = [...conditions, { ...filterCondition(state.range?.colStart ?? 0), group }]
  } else if (action.type === 'remove-group') {
    if (!groups.includes(action.group) || groups.length <= 1) return false
    conditions = conditions.filter((item) => (item.group ?? 0) !== action.group)
  } else {
    const members = conditions.filter((item) => (item.group ?? 0) === action.group)
    if (!members.length || members.length >= 8 || conditions.length >= 32) return false
    const start = state.range?.colStart ?? 0
    const last = state.range?.colEnd ?? sheet.colCount - 1
    const col = Math.min(last, Math.max(start, members.at(-1)!.col + 1))
    conditions = [...conditions, { ...filterCondition(col), group: action.group }]
  }
  set(filterPanelStateAtom, { ...state, conditions, advanced: true, browser: undefined, error: '' })
  return true
})
