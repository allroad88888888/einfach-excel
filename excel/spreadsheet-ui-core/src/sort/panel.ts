import { atom } from '@einfach/core'
import { editingSessionAtom } from '../editing/session-atoms'
import { selectionSnapshotAtom } from '../selection'
import { rangeEquals, type CellRange } from '../shared'
import type { RustSortKey } from '../rust-workbook/sort-commands'
import { sortFeedbackAtom, sortSelectionAtom } from './command'

interface SortPanel {
  readonly target: { sheetId: string; range: CellRange } | null
  readonly keys: readonly RustSortKey[]
  readonly hasHeader: boolean
  readonly error: string
}
const initial: SortPanel = { target: null, keys: [], hasHeader: false, error: '' }
const stateAtom = atom(initial)
export const sortPanelAtom = atom((get) => get(stateAtom))
type Action = 'open' | 'close' | 'apply' | 'add' |
  { type: 'header'; value: boolean } | { type: 'remove'; index: number } |
  { type: 'key'; index: number; key: RustSortKey }

/** 面板保存用户选择，不读取数据，也不维护排序后的行映射。 */
export const configureSortAtom = atom(null, async (get, set, action: Action): Promise<boolean> => {
  if (get(sortFeedbackAtom).busy || get(editingSessionAtom).source !== null) return false
  const state = get(stateAtom)
  if (action === 'close') { set(stateAtom, initial); return true }
  const selection = get(selectionSnapshotAtom)
  if (action === 'open') {
    set(stateAtom, { ...initial, target: {
      sheetId: selection.selection.sheetId, range: { ...selection.range },
    }, keys: [{ col: selection.range.colStart, direction: 'asc' }] })
    return true
  }
  if (!state.target) return false
  if (action === 'add') {
    if (state.keys.length >= 8) return false
    const { colStart, colEnd } = state.target.range
    const used = new Set(state.keys.map((key) => key.col))
    let col = colStart
    while (used.has(col)) col += 1
    if (col > colEnd) return false
    set(stateAtom, { ...state, error: '', keys: [...state.keys, { col, direction: 'asc' }] })
    return true
  }
  if (typeof action === 'object') {
    if (action.type === 'header') set(stateAtom, { ...state, hasHeader: action.value, error: '' })
    else {
      if (action.index < 0 || action.index >= state.keys.length ||
        (action.type === 'remove' && state.keys.length === 1)) return false
      set(stateAtom, { ...state, error: '', keys: action.type === 'remove'
        ? state.keys.filter((_, index) => index !== action.index)
        : state.keys.map((key, index) => index === action.index ? action.key : key) })
    }
    return true
  }
  const fail = (error: string) => { set(stateAtom, { ...state, error }); return false }
  if (state.target.sheetId !== selection.selection.sheetId ||
    !rangeEquals(state.target.range, selection.range))
    return fail('The selection changed. Close and reopen Sort.')
  const completed = await set(sortSelectionAtom, { keys: state.keys, hasHeader: state.hasHeader })
  if (completed) set(stateAtom, initial)
  else fail(get(sortFeedbackAtom).error || 'Sort was not applied. Try again.')
  return completed
})
