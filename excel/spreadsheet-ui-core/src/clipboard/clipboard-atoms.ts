import { atom, type Atom } from '@einfach/core'
import {
  clearClipboardState,
  copyClipboardState,
  cutClipboardState,
  markClipboardReadyState,
  pasteClipboardState,
  setClipboardErrorState,
} from './clipboard-state'
import { createClipboardState } from './transfer-intent'
import type { ClipboardIntent, ClipboardState, ClipboardTransferInput } from './types'

const clipboardStateBackingAtom = atom<ClipboardState>(createClipboardState())
clipboardStateBackingAtom.debugLabel = 'spreadsheet.clipboard.stateBacking'

export const clipboardStateAtom: Atom<ClipboardState> = atom((get) =>
  get(clipboardStateBackingAtom),
)
clipboardStateAtom.debugLabel = 'spreadsheet.clipboard.state'

const clipboardIntentBackingAtom = atom<ClipboardIntent | null>(null)
clipboardIntentBackingAtom.debugLabel = 'spreadsheet.clipboard.intentBacking'

export const clipboardIntentAtom: Atom<ClipboardIntent | null> = atom((get) =>
  get(clipboardIntentBackingAtom),
)
clipboardIntentAtom.debugLabel = 'spreadsheet.clipboard.intent'

export const copyClipboardAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (get, set, input: ClipboardTransferInput) => {
    const nextState = copyClipboardState(get(clipboardStateBackingAtom), input)
    set(clipboardStateBackingAtom, nextState)
    set(clipboardIntentBackingAtom, nextState.intent)
    return nextState.intent
  },
)
copyClipboardAtom.debugLabel = 'spreadsheet.clipboard.copy'

export const cutClipboardAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (get, set, input: ClipboardTransferInput) => {
    const nextState = cutClipboardState(get(clipboardStateBackingAtom), input)
    set(clipboardStateBackingAtom, nextState)
    set(clipboardIntentBackingAtom, nextState.intent)
    return nextState.intent
  },
)
cutClipboardAtom.debugLabel = 'spreadsheet.clipboard.cut'

export const pasteClipboardAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (get, set, input: ClipboardTransferInput) => {
    const nextState = pasteClipboardState(get(clipboardStateBackingAtom), input)
    set(clipboardStateBackingAtom, nextState)
    set(clipboardIntentBackingAtom, nextState.intent)
    return nextState.intent
  },
)
pasteClipboardAtom.debugLabel = 'spreadsheet.clipboard.paste'

export const clearClipboardAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (_get, set) => {
    set(clipboardStateBackingAtom, clearClipboardState())
    set(clipboardIntentBackingAtom, null)
  },
)
clearClipboardAtom.debugLabel = 'spreadsheet.clipboard.clear'

export const markClipboardReadyAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (get, set) => {
    set(
      clipboardStateBackingAtom,
      markClipboardReadyState(get(clipboardStateBackingAtom)),
    )
  },
)
markClipboardReadyAtom.debugLabel = 'spreadsheet.clipboard.ready'

export const setClipboardErrorAtom = atom(
  (get) => get(clipboardStateBackingAtom),
  (get, set, error: ClipboardState['error']) => {
    const nextState = setClipboardErrorState(get(clipboardStateBackingAtom), error)
    set(clipboardStateBackingAtom, nextState)
    return nextState
  },
)
setClipboardErrorAtom.debugLabel = 'spreadsheet.clipboard.error'
