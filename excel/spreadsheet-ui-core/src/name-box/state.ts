import { atom } from '@einfach/core'
import { primarySelectionRegionAtom, selectionSnapshotAtom } from '../selection'
import { workbookDocumentAtom } from '../runtime/workbook-document'
import { nativeNamedRangesAtom, resolveNativeNamedRange } from '../named-ranges/native-catalog'
import { rangeToA1 } from './address'
import type { NameBoxMode, NameBoxSessionInput, UpdateNameBoxInput } from './types'

export const nameBoxInputAtom = atom<string>('')
nameBoxInputAtom.debugLabel = 'spreadsheet.nameBox.input'

export const nameBoxModeAtom = atom<NameBoxMode>('idle')
nameBoxModeAtom.debugLabel = 'spreadsheet.nameBox.mode'

export const nameBoxErrorMessageAtom = atom('')
export const nameBoxErrorAtom = atom((get) => get(nameBoxErrorMessageAtom).length > 0)
nameBoxErrorAtom.debugLabel = 'spreadsheet.nameBox.error'

export const nameBoxFocusedAtom = atom<boolean>(false)
nameBoxFocusedAtom.debugLabel = 'spreadsheet.nameBox.focused'

export const nameBoxLastCommittedAtom = atom<string>('')
nameBoxLastCommittedAtom.debugLabel = 'spreadsheet.nameBox.lastCommitted'

export const nameBoxSessionIdAtom = atom<number>(0)
nameBoxSessionIdAtom.debugLabel = 'spreadsheet.nameBox.sessionId'

/** 名称只是同一 Rust 投影的派生显示，不同步第二份注册表。 */
export const nameBoxDisplayAtom = atom((get): string => {
  const snapshot = get(selectionSnapshotAtom)
  const address = rangeToA1(snapshot.range)
  const names = get(nativeNamedRangesAtom)
  const sheets = get(workbookDocumentAtom).sheets
  const match = names.find((entry) => {
    const target = resolveNativeNamedRange(entry.name, [entry], sheets)
    return target?.sheetId === snapshot.selection.sheetId && rangeToA1(target.range) === address
  })
  return match?.name ?? address
})

/** Starts a new edit session and snapshots the canonical display. */
export const focusNameBoxAtom = atom(null, (get, set): number => {
  const current = get(nameBoxSessionIdAtom)
  const next = current >= Number.MAX_SAFE_INTEGER ? 1 : current + 1
  const display = get(nameBoxDisplayAtom)
  set(nameBoxSessionIdAtom, next)
  set(nameBoxFocusedAtom, true)
  set(nameBoxLastCommittedAtom, display)
  set(nameBoxInputAtom, display)
  set(nameBoxErrorMessageAtom, '')
  set(nameBoxModeAtom, 'typing')
  return next
})
focusNameBoxAtom.debugLabel = 'spreadsheet.nameBox.focus'

/** Updates input only when the originating edit session is still active. */
export const updateNameBoxInputAtom = atom(null, (get, set, input: UpdateNameBoxInput): boolean => {
  if (input.sessionId !== undefined && input.sessionId !== get(nameBoxSessionIdAtom)) {
    return false
  }
  set(nameBoxInputAtom, input.input)
  set(nameBoxErrorMessageAtom, '')
  set(nameBoxModeAtom, 'typing')
  return true
})
updateNameBoxInputAtom.debugLabel = 'spreadsheet.nameBox.updateInput'

/** Records the DOM blur without committing or replaying an older session. */
export const blurNameBoxAtom = atom(null, (get, set, input?: NameBoxSessionInput): boolean => {
  if (input?.sessionId !== undefined && input.sessionId !== get(nameBoxSessionIdAtom)) {
    return false
  }
  set(nameBoxFocusedAtom, false)
  set(nameBoxModeAtom, 'idle')
  return true
})
blurNameBoxAtom.debugLabel = 'spreadsheet.nameBox.blur'

/** Resets the input to the current display and clears any error flash. */
export const revertNameBoxAtom = atom(null, (get, set, input?: NameBoxSessionInput): boolean => {
  if (input?.sessionId !== undefined && input.sessionId !== get(nameBoxSessionIdAtom)) {
    return false
  }
  const display = get(nameBoxDisplayAtom)
  set(nameBoxInputAtom, display)
  set(nameBoxLastCommittedAtom, display)
  set(nameBoxErrorMessageAtom, '')
  set(nameBoxModeAtom, 'idle')
  return true
})
revertNameBoxAtom.debugLabel = 'spreadsheet.nameBox.revert'

/** Convenience getter exposed for tests / debug surfaces. */
export const nameBoxStateAtom = atom((get) => ({
  input: get(nameBoxInputAtom),
  mode: get(nameBoxModeAtom),
  display: get(nameBoxDisplayAtom),
  error: get(nameBoxErrorAtom),
  errorMessage: get(nameBoxErrorMessageAtom),
  focused: get(nameBoxFocusedAtom),
  lastCommitted: get(nameBoxLastCommittedAtom),
  sessionId: get(nameBoxSessionIdAtom),
  primaryRegion: get(primarySelectionRegionAtom),
}))
nameBoxStateAtom.debugLabel = 'spreadsheet.nameBox.state'
