import { atom } from '@einfach/core'
import {
  editingSessionAtom, rustWorkbookConnectionAtom, selectionAuthorityWitnessAtom,
  selectionSnapshotAtom, sortFeedbackAtom, sortSelectionAtom,
  type CellRange, type RustWorkbookCommands, type RustWorkbookConnection,
  type SelectionAuthorityWitness,
} from '@einfach-excel/spreadsheet-ui-core'

type Options = Pick<RustWorkbookCommands['range.sort']['payload'], 'hasHeader' | 'keys'>
export type ColorSortLevel = Options['keys'][number]
export type ColorSortMode = 'value' | 'cell-color' | 'font-color'
interface ColorSortPanel extends Options {
  readonly target: CellRange | null
  readonly busy: boolean
  readonly error: 'stale' | 'chooseColor' | 'failed' | null
  readonly detail: string
}
const idle: ColorSortPanel = {
  target: null, hasHeader: false, keys: [], busy: false, error: null, detail: '',
}
const stateAtom = atom<ColorSortPanel & {
  readonly connection: RustWorkbookConnection | null
  readonly selection: SelectionAuthorityWitness | null
}>({ ...idle, connection: null, selection: null })

export const colorSortPanelAtom = atom<ColorSortPanel>(get => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : idle
})

type Action = 'open' | 'close' | 'add' | 'apply'
  | { type: 'header'; value: boolean }
  | { type: 'key'; index: number; key: ColorSortLevel }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; direction: 'up' | 'down' }

export function newColorSortLevel(col: number, mode: ColorSortMode): ColorSortLevel {
  return mode === 'value'
    ? { col, direction: 'asc' }
    : { col, sortOn: mode, color: '#ff0000', position: 'top' }
}

/** Capture only the editor's selection authority; effective colors stay in Rust. */
export const configureColorSortAtom = atom(null, async (get, set, action: Action) => {
  const panel = get(colorSortPanelAtom)
  const connection = get(rustWorkbookConnectionAtom)
  if (panel.busy) return false
  if (action === 'close') {
    set(stateAtom, { ...idle, connection, selection: null })
    return true
  }
  if (!connection || get(sortFeedbackAtom).busy || get(editingSessionAtom).source !== null)
    return false
  if (action === 'open') {
    const range = get(selectionSnapshotAtom).range
    set(stateAtom, { ...idle, connection, selection: get(selectionAuthorityWitnessAtom),
      target: { ...range }, keys: [newColorSortLevel(range.colStart, 'cell-color')] })
    return true
  }
  if (!panel.target) return false
  const draft = { ...get(stateAtom), error: null, detail: '' }
  const keys = [...panel.keys]
  if (action === 'add') {
    if (keys.length === 8) return false
    set(stateAtom, { ...draft, keys: [...keys, newColorSortLevel(panel.target.colStart, 'cell-color')] })
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

stateAtom.debugLabel = 'plugin.dataSort.colorState'
colorSortPanelAtom.debugLabel = 'plugin.dataSort.colorPanel'
configureColorSortAtom.debugLabel = 'plugin.dataSort.configureColor'
