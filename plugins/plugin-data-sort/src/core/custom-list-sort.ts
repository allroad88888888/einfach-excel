import { atom } from '@einfach/core'
import {
  editingSessionAtom, namedListDirectoryAtom, normalizeFillSeriesListWitness, rangeEquals,
  rustWorkbookConnectionAtom, selectionSnapshotAtom, sortFeedbackAtom, sortSelectionAtom,
  type CellRange, type RustSortCriterion, type RustWorkbookConnection,
} from '@einfach-excel/spreadsheet-ui-core'

export interface ListSortLevel {
  readonly col: number
  readonly direction: 'asc' | 'desc'
  readonly listName: string
}
interface ListSortDraft {
  readonly target: { readonly sheetId: string; readonly range: CellRange } | null
  readonly keys: readonly ListSortLevel[]
  readonly hasHeader: boolean
  readonly caseSensitive: boolean
  readonly emptyFirst: boolean
  readonly busy: boolean
  readonly error: 'selection' | 'missingList' | 'chooseList' | 'failed' | null
  readonly detail: string
}
const initial: ListSortDraft = {
  target: null, keys: [], hasHeader: false, caseSensitive: false, emptyFirst: false,
  busy: false, error: null, detail: '',
}
const stateAtom = atom<ListSortDraft & { readonly connection: RustWorkbookConnection | null }>({
  ...initial, connection: null,
})

/** The draft is local to this plugin, store and workbook connection. No list directory is copied. */
export const customListSortPanelAtom = atom<ListSortDraft>(get => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : initial
})
type Action = 'open' | 'close' | 'apply' | 'add' |
  { type: 'header'; value: boolean } | { type: 'case-sensitive'; value: boolean } |
  { type: 'empty-first'; value: boolean } |
  { type: 'key'; index: number; key: ListSortLevel } |
  { type: 'remove'; index: number } |
  { type: 'move'; index: number; direction: 'up' | 'down' }

/** Resolve the selected source again on Apply, then send one native sort command. */
export const configureCustomListSortAtom = atom(null, async (get, set, action: Action) => {
  const state = get(customListSortPanelAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (state.busy || get(sortFeedbackAtom).busy || get(editingSessionAtom).source !== null)
    return false
  if (action === 'close') { set(stateAtom, { ...initial, connection }); return true }
  if (!connection) return false
  const selection = get(selectionSnapshotAtom)
  if (action === 'open') {
    set(stateAtom, { ...initial, connection, target: {
      sheetId: selection.selection.sheetId, range: { ...selection.range },
    }, keys: [{ col: selection.range.colStart, direction: 'asc', listName: '' }] })
    return true
  }
  if (!state.target) return false
  const draft = { ...state, connection, error: null, detail: '' }
  const { range, sheetId } = state.target
  if (action === 'add') {
    if (state.keys.length >= 8) return false
    const used = new Set(state.keys.map(key => key.col))
    let col = range.colStart
    while (used.has(col)) col++
    if (col > range.colEnd) return false
    set(stateAtom, { ...draft, keys: [...state.keys, { col, direction: 'asc', listName: '' }] })
    return true
  }
  if (typeof action === 'object') {
    if (action.type === 'header') set(stateAtom, { ...draft, hasHeader: action.value })
    else if (action.type === 'case-sensitive') set(stateAtom, { ...draft, caseSensitive: action.value })
    else if (action.type === 'empty-first') set(stateAtom, { ...draft, emptyFirst: action.value })
    else {
      const { index } = action
      if (!Number.isSafeInteger(index) || index < 0 || index >= state.keys.length) return false
      const keys = [...state.keys]
      if (action.type === 'remove') {
        if (keys.length === 1) return false
        keys.splice(index, 1)
      } else if (action.type === 'move') {
        const next = index + (action.direction === 'up' ? -1 : 1)
        if (next < 0 || next >= keys.length) return false
        ;[keys[index], keys[next]] = [keys[next]!, keys[index]!]
      } else {
        const key = action.key
        if (!Number.isSafeInteger(key.col) || key.col < range.colStart || key.col > range.colEnd ||
          keys.some((other, i) => i !== index && other.col === key.col) ||
          !['asc', 'desc'].includes(key.direction)) return false
        keys[index] = { ...key }
      }
      set(stateAtom, { ...draft, keys })
    }
    return true
  }
  const fail = (error: ListSortDraft['error']) => {
    set(stateAtom, { ...draft, error })
    return false
  }
  if (sheetId !== selection.selection.sheetId || !rangeEquals(range, selection.range))
    return fail('selection')
  if (!state.keys.some(key => key.listName)) return fail('chooseList')
  const directory = get(namedListDirectoryAtom)
  const keys: RustSortCriterion[] = []
  for (const key of state.keys) {
    if (!key.listName) { keys.push({ col: key.col, direction: key.direction }); continue }
    const selected = directory.find(list => list.listName === key.listName)
    if (!selected || !normalizeFillSeriesListWitness(selected)) return fail('missingList')
    keys.push({ col: key.col, direction: key.direction,
      list: { values: [...selected.values], locale: selected.locale } })
  }
  const pending = { ...draft, busy: true }
  set(stateAtom, pending)
  const result = set(sortSelectionAtom, { keys, hasHeader: state.hasHeader,
    caseSensitive: state.caseSensitive, emptyFirst: state.emptyFirst })
  await Promise.resolve()
  if (get(stateAtom) === pending) set(stateAtom, pending)
  const completed = await result
  if (get(rustWorkbookConnectionAtom) !== connection || get(stateAtom) !== pending) return false
  set(stateAtom, completed ? { ...initial, connection } : {
    ...draft, error: 'failed', detail: get(sortFeedbackAtom).error,
  })
  return completed
})
stateAtom.debugLabel = 'plugin.dataSort.draft'
customListSortPanelAtom.debugLabel = 'plugin.dataSort.panel'
configureCustomListSortAtom.debugLabel = 'plugin.dataSort.configure'
