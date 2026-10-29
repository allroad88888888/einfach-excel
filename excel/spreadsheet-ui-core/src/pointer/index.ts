import { atom, type Atom } from '@einfach/core'
import {
  cancelPointerSessionState,
  commitPointerSessionState,
  createPointerSessionState,
  startPointerSessionState,
  updatePointerSessionState,
} from './session-state'
import { createPointerCommitIntent } from './commit-intent'
import type {
  PointerIntent,
  PointerSessionState,
  PointerStartInput,
  PointerUpdateInput,
} from './types'

export * from './types'
export {
  createFillHandlePreview,
  getFillHandleWriteRange,
  getFillHandleSourceCoord,
} from './fill-handle'
export type { FillHandlePreview } from './fill-handle'
export {
  createPointerSessionState,
  startPointerSessionState,
  updatePointerSessionState,
  commitPointerSessionState,
  cancelPointerSessionState,
} from './session-state'
export { createPointerCommitIntent } from './commit-intent'

const pointerSessionBackingAtom = atom<PointerSessionState>(createPointerSessionState())
pointerSessionBackingAtom.debugLabel = 'spreadsheet.pointer.sessionBacking'

export const pointerSessionAtom: Atom<PointerSessionState> = atom((get) =>
  get(pointerSessionBackingAtom),
)
pointerSessionAtom.debugLabel = 'spreadsheet.pointer.session'

const pointerIntentBackingAtom = atom<PointerIntent | null>(null)
pointerIntentBackingAtom.debugLabel = 'spreadsheet.pointer.intentBacking'

export const pointerIntentAtom: Atom<PointerIntent | null> = atom((get) =>
  get(pointerIntentBackingAtom),
)
pointerIntentAtom.debugLabel = 'spreadsheet.pointer.intent'

export const pointerIsActiveAtom = atom((get) => get(pointerSessionAtom).status === 'active')
pointerIsActiveAtom.debugLabel = 'spreadsheet.pointer.isActive'

export const startPointerAtom = atom(
  (get) => get(pointerSessionAtom),
  (get, set, input: PointerStartInput) => {
    set(pointerSessionBackingAtom, startPointerSessionState(get(pointerSessionBackingAtom), input))
    set(pointerIntentBackingAtom, null)
  },
)
startPointerAtom.debugLabel = 'spreadsheet.pointer.start'

export const updatePointerAtom = atom(
  (get) => get(pointerSessionAtom),
  (get, set, input: PointerUpdateInput) => {
    set(pointerSessionBackingAtom, updatePointerSessionState(get(pointerSessionBackingAtom), input))
  },
)
updatePointerAtom.debugLabel = 'spreadsheet.pointer.update'

export const commitPointerAtom = atom(
  (get) => get(pointerSessionAtom),
  (get, set) => {
    const state = get(pointerSessionBackingAtom)
    const intent = createPointerCommitIntent(state)
    if (intent === null) {
      return null
    }

    set(pointerIntentBackingAtom, intent)
    set(pointerSessionBackingAtom, commitPointerSessionState(state))
    return intent
  },
)
commitPointerAtom.debugLabel = 'spreadsheet.pointer.commit'

export const cancelPointerAtom = atom(
  (get) => get(pointerSessionAtom),
  (get, set) => {
    const state = get(pointerSessionBackingAtom)
    if (state.status === 'idle' && state.interaction === null) {
      return null
    }

    set(pointerSessionBackingAtom, cancelPointerSessionState(state))
    set(pointerIntentBackingAtom, null)
    return null
  },
)
cancelPointerAtom.debugLabel = 'spreadsheet.pointer.cancel'
