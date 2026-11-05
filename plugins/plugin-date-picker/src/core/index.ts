import { atom } from '@einfach/core'
import {
  activeCellFactAtom, activeCellFormatAtom, activeCellInputTextAtom, activeWorkbookSheetAtom,
  cancelEditingAtom, commitCellEditingAtom,
  editingCommitLifecycleAtom, editingDraftAtom, editingSessionAtom, selectionSnapshotAtom,
  type EditingSessionState,
} from '@einfach-excel/spreadsheet-ui-core'

const draftAtom = atom<{ session: EditingSessionState; value: string } | null>(null)
draftAtom.debugLabel = 'plugin.datePicker.draft'

/** Calendar input validation only. Spreadsheet dates are parsed and stored exclusively by Rust. */
function isoDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match || Number(match[1]) < 1900) return ''
  const date = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? value : ''
}

export const datePickerStateAtom = atom((get) => {
  const session = get(editingSessionAtom)
  const source = session.source
  const selected = get(selectionSnapshotAtom).activeCell
  const local = get(draftAtom)
  const lifecycle = get(editingCommitLifecycleAtom)
  // Rust owns serial-to-date conversion; reuse its ISO display when the source is unchanged.
  const initial = session.draft === get(activeCellInputTextAtom)
    ? isoDate(get(activeCellFactAtom)?.displayValue ?? '') : ''
  const value = local?.session === session ? local.value : isoDate(session.draft) || initial
  return {
    visible: source !== null && source.sheetId === get(activeWorkbookSheetAtom)?.id
      && source.cell.row === selected.row && source.cell.col === selected.col
      && get(activeCellFormatAtom).numberFormat?.kind === 'date'
      && !session.draft.trimStart().startsWith('='),
    value,
    valid: isoDate(value) !== '',
    busy: lifecycle.status === 'pending' || lifecycle.status === 'outcome-unknown',
  }
})
datePickerStateAtom.debugLabel = 'plugin.datePicker.state'

export const runDatePickerAtom = atom(null, (get, set, action: 'apply' | 'cancel' | { value: string }) => {
  const state = get(datePickerStateAtom)
  if (!state.visible || state.busy) return false
  if (typeof action === 'object') {
    set(draftAtom, { session: get(editingSessionAtom), value: action.value })
    return true
  }
  if (action === 'cancel') {
    set(draftAtom, null)
    return set(cancelEditingAtom)
  }
  if (!state.valid) return false
  set(editingDraftAtom, { draft: state.value })
  set(draftAtom, null)
  return set(commitCellEditingAtom)
})
runDatePickerAtom.debugLabel = 'plugin.datePicker.run'
