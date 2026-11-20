import { atom } from '@einfach/core'
import {
  editingSessionAtom, rustWorkbookConnectionAtom, selectionAuthorityWitnessAtom,
  selectionSnapshotAtom, sortFeedbackAtom, sortSelectionAtom,
  type CellRange, type RustRowSortCriterion, type RustSortCriterion,
  type RustWorkbookConnection, type SelectionAuthorityWitness, type SortRangeOptions,
} from '@einfach-excel/spreadsheet-ui-core'

export type VisualSortLevel = RustSortCriterion | RustRowSortCriterion
export type VisualSortMode = 'value' | 'cell-color' | 'font-color' | 'icon'
export type VisualSortEntry = 'color' | 'icon' | 'horizontal'
type Location = { readonly col: number } | { readonly row: number }

interface VisualSortPanel {
  readonly target: CellRange | null
  readonly entry: VisualSortEntry
  readonly keys: readonly VisualSortLevel[]
  readonly hasHeader: boolean
  readonly caseSensitive: boolean
  readonly emptyFirst: boolean
  readonly busy: boolean
  readonly error: 'stale' | 'chooseColor' | 'failed' | null
  readonly detail: string
}
const idle: VisualSortPanel = {
  target: null, entry: 'color', keys: [], hasHeader: false, caseSensitive: false, emptyFirst: false,
  busy: false, error: null, detail: '',
}
const stateAtom = atom<VisualSortPanel & {
  readonly connection: RustWorkbookConnection | null
  readonly selection: SelectionAuthorityWitness | null
}>({ ...idle, connection: null, selection: null })

export const visualSortPanelAtom = atom<VisualSortPanel>(get => {
  const state = get(stateAtom)
  return state.connection === get(rustWorkbookConnectionAtom) ? state : idle
})

type Action = 'open' | 'open-icon' | 'open-horizontal' | 'close' | 'add' | 'apply'
  | { type: 'header' | 'case' | 'empty'; value: boolean }
  | { type: 'key'; index: number; key: VisualSortLevel }
  | { type: 'remove'; index: number }
  | { type: 'move'; index: number; direction: 'up' | 'down' }

export function newVisualSortLevel(location: Location, mode: VisualSortMode): VisualSortLevel {
  if (mode === 'value') return { ...location, direction: 'asc' }
  const appearance = mode === 'icon' ? { sortOn: mode, icon: null } : { sortOn: mode, color: '#ff0000' }
  return 'row' in location
    ? { ...location, ...appearance, position: 'left' }
    : { ...location, ...appearance, position: 'top' }
}

const defaultMode = { color: 'cell-color', icon: 'icon', horizontal: 'value' } as const
const byRow = (key: VisualSortLevel): key is RustRowSortCriterion => 'row' in key
const byColumn = (key: VisualSortLevel): key is RustSortCriterion => 'col' in key

/** Keep the draft tied to the editor's workbook and selection authority. */
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
  if (action === 'open' || action === 'open-icon' || action === 'open-horizontal') {
    const entry = action === 'open-horizontal' ? 'horizontal' : action === 'open-icon' ? 'icon' : 'color'
    const range = get(selectionSnapshotAtom).range
    const location = entry === 'horizontal' ? { row: range.rowStart } : { col: range.colStart }
    set(stateAtom, { ...idle, connection, selection: get(selectionAuthorityWitnessAtom),
      entry, target: { ...range }, keys: [newVisualSortLevel(location, defaultMode[entry])] })
    return true
  }
  if (!panel.target) return false
  const draft = { ...get(stateAtom), error: null, detail: '' }
  const keys = [...panel.keys]
  const horizontal = panel.entry === 'horizontal'
  if (action === 'add') {
    if (keys.length === 8) return false
    const key = horizontal
      ? addRowKey(keys.filter(byRow), panel.target)
      : newVisualSortLevel({ col: panel.target.colStart }, defaultMode[panel.entry])
    set(stateAtom, { ...draft, keys: [...keys, key] })
    return true
  }
  if (typeof action === 'object') {
    if (action.type === 'header' || action.type === 'case' || action.type === 'empty') {
      if (horizontal && action.type === 'header') return false
      const option = action.type === 'header' ? 'hasHeader'
        : action.type === 'case' ? 'caseSensitive' : 'emptyFirst'
      set(stateAtom, { ...draft, [option]: action.value })
      return true
    }
    if (!('index' in action)) return false
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
      if (horizontal !== byRow(key)) return false
      if ('col' in key && (!Number.isSafeInteger(key.col) || key.col < panel.target.colStart ||
        key.col > panel.target.colEnd)) return false
      keys[index] = { ...key }
    }
    set(stateAtom, { ...draft, keys })
    return true
  }
  if (draft.selection !== get(selectionAuthorityWitnessAtom)) {
    set(stateAtom, { ...draft, error: 'stale' })
    return false
  }
  if (horizontal && keys.some(key => !byRow(key) || !Number.isSafeInteger(key.row) ||
    key.row < panel.target!.rowStart || key.row > panel.target!.rowEnd)) {
    set(stateAtom, { ...draft, error: 'failed',
      detail: 'Choose 1–8 different rows inside the selected range.' })
    return false
  }
  if (!horizontal && !keys.some(key => 'sortOn' in key)) {
    set(stateAtom, { ...draft, error: 'chooseColor' })
    return false
  }
  const settings: SortRangeOptions = horizontal
    ? { orientation: 'left-to-right', keys: keys.filter(byRow), hasHeader: false,
      caseSensitive: draft.caseSensitive, emptyFirst: draft.emptyFirst }
    : { keys: keys.filter(byColumn), hasHeader: draft.hasHeader,
      caseSensitive: draft.caseSensitive, emptyFirst: draft.emptyFirst }
  const previousFeedback = get(sortFeedbackAtom)
  const pending = { ...draft, busy: true }
  set(stateAtom, pending)
  const request = set(sortSelectionAtom, settings)
  await Promise.resolve()
  if (get(stateAtom) === pending) set(stateAtom, pending)
  const sorted = await request
  if (get(stateAtom) !== pending || get(rustWorkbookConnectionAtom) !== connection) return false
  const nextFeedback = get(sortFeedbackAtom)
  const detail = nextFeedback === previousFeedback ? '' : nextFeedback.error
  set(stateAtom, sorted
    ? { ...idle, connection, selection: null }
    : { ...draft, error: 'failed', detail })
  return sorted
})

function addRowKey(keys: readonly RustRowSortCriterion[], range: CellRange): VisualSortLevel {
  const used = new Set(keys.map(key => key.row))
  let row = range.rowStart
  while (used.has(row)) row += 1
  return row <= range.rowEnd ? newVisualSortLevel({ row }, 'value')
    : newVisualSortLevel({ row: range.rowStart }, 'cell-color')
}

stateAtom.debugLabel = 'plugin.dataSort.visualState'
visualSortPanelAtom.debugLabel = 'plugin.dataSort.visualPanel'
configureVisualSortAtom.debugLabel = 'plugin.dataSort.configureVisual'
