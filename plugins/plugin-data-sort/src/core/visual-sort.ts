import { atom } from '@einfach/core'
import {
  editingSessionAtom, rustWorkbookConnectionAtom, selectionAuthorityWitnessAtom,
  selectionSnapshotAtom, sortFeedbackAtom, sortSelectionAtom,
  type CellRange, type RustWorkbookCommands, type RustWorkbookConnection,
  type SelectionAuthorityWitness,
} from '@einfach-excel/spreadsheet-ui-core'

type Options = Pick<RustWorkbookCommands['range.sort']['payload'], 'hasHeader' | 'keys'>
export type VisualSortLevel = Options['keys'][number]
export type VisualSortMode = 'value' | 'cell-color' | 'font-color' | 'icon'
export type VisualSortEntry = 'color' | 'icon'
interface ColorSortPanel extends Options {
  readonly target: CellRange | null
  readonly entry: VisualSortEntry
  readonly busy: boolean
  readonly error: 'stale' | 'chooseColor' | 'failed' | null
  readonly detail: string
}
const idle: ColorSortPanel = {
  target: null, entry: 'color', hasHeader: false, keys: [], busy: false, error: null, detail: '',
}
const stateAtom = atom<ColorSortPanel & {
  readonly connection: RustWorkbookConnection | null
  readonly selection: SelectionAuthorityWitness | null
}>({ ...idle, connection: null, selection: null })

export const visualSortPanelAtom = atom<ColorSortPanel>(get => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : idle
})

type Action = 'open' | 'open-icon' | 'close' | 'add' | 'apply'
  | { type: 'header'; value: boolean }
  | { type: 'key'; index: number; key: VisualSortLevel }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; direction: 'up' | 'down' }

export function newVisualSortLevel(col: number, mode: VisualSortMode): VisualSortLevel {
  if (mode === 'value') return { col, direction: 'asc' }
  if (mode === 'icon') return { col, sortOn: mode, icon: null, position: 'top' }
  return { col, sortOn: mode, color: '#ff0000', position: 'top' }
}

/** Capture only the editor's selection authority; effective colors stay in Rust. */
export const configureVisualSortAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(visualSortPanelAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (panel.busy) return false
  if (action === 'close') {
    set(stateAtom, { ...idle, connection, selection: null })
    return true
  }
  if (!connection || get(sortFeedbackAtom).busy || get(editingSessionAtom).source !== null)
    return false
  if (action === 'open' || action === 'open-icon') {
    const entry = action === 'open-icon' ? 'icon' : 'color'
    const range = get(selectionSnapshotAtom).range
    set(stateAtom, { ...idle, connection, selection: get(selectionAuthorityWitnessAtom),
      entry, target: { ...range },
      keys: [newVisualSortLevel(range.colStart, entry === 'icon' ? 'icon' : 'cell-color')] })
    return true
  }
  if (!panel.target) return false
  const draft = { ...get(stateAtom), error: null, detail: '' }
  const keys = [...panel.keys]
  if (action === 'add') {
    if (keys.length === 8) return false
    const key = newVisualSortLevel(panel.target.colStart, panel.entry === 'icon' ? 'icon' : 'cell-color')
    set(stateAtom, { ...draft, keys: [...keys, key] })
    return true
  }
  if (typeof action === 'object') {
    if (action.type === 'header') {
      set(stateAtom, { ...draft, hasHeader: action.value })
      return true
    }
    const { index } = action
    if (!Number.isSafeInteger(index) || index < 0 || index >= keys.length) return false
    if (action.type === 'remove') {
      if (keys.length === 1) return false
      keys.splice(index, 1)
    } else if (action.type === 'move') {
      const next = index + (action.direction === 'up' ? -1 : 1)
      if (next < 0 || next >= keys.length) return false
      ;[keys[index], keys[next]] = [keys[next]!, keys[index]!]
    } else {
      const { key } = action
      if (!Number.isSafeInteger(key.col) || key.col < panel.target.colStart ||
        key.col > panel.target.colEnd) return false
      keys[index] = { ...key }
    }
    set(stateAtom, { ...draft, keys })
    return true
  }
  if (draft.selection !== get(selectionAuthorityWitnessAtom)) {
    set(stateAtom, { ...draft, error: 'stale' })
    return false
  }
  if (!keys.some(key => 'sortOn' in key)) {
    set(stateAtom, { ...draft, error: 'chooseColor' })
    return false
  }
  const pending = { ...draft, busy: true }
  set(stateAtom, pending)
  const request = set(sortSelectionAtom, { keys, hasHeader: draft.hasHeader })
  await Promise.resolve()
  if (get(stateAtom) === pending) set(stateAtom, pending)
  const sorted = await request
  if (get(stateAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
  set(stateAtom, sorted
    ? { ...idle, connection, selection: null }
    : { ...draft, error: 'failed', detail: get(sortFeedbackAtom).error })
  return sorted
})

stateAtom.debugLabel = 'plugin.dataSort.visualState'
visualSortPanelAtom.debugLabel = 'plugin.dataSort.visualPanel'
configureVisualSortAtom.debugLabel = 'plugin.dataSort.configureVisual'
