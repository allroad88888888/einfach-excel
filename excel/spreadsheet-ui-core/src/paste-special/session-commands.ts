import { atom } from '@einfach/core'
import type { Getter, Setter } from '@einfach/core'
import { clipboardStateAtom } from '../clipboard'
import { releaseHistoryProducerReservationAtom } from '../history'
import { selectionSnapshotAtom } from '../selection'
import { workspaceSessionAtom } from '../workspace'
import { normalizePasteSpecialSupportedKinds } from './constants'
import {
  nextPasteSpecialSessionId,
  pasteSpecialBlocksClose,
  pasteSpecialLifecycle,
  pasteSpecialSessionBlockReason,
  snapshotPasteSpecialOptions,
  snapshotPayload,
  snapshotRange,
  snapshotSource,
} from './session-snapshot'
import {
  activePasteSpecialMutationAtom,
  pasteSpecialCanCloseAtom,
  pasteSpecialCapabilityAtom,
  pasteSpecialCapabilityBackingAtom,
  pasteSpecialErrorBackingAtom,
  pasteSpecialLifecycleAtom,
  pasteSpecialLifecycleBackingAtom,
  pasteSpecialOpenAtom,
  pasteSpecialOpenBackingAtom,
  pasteSpecialOptionsAtom,
  pasteSpecialOptionsBackingAtom,
  pasteSpecialSessionAtom,
  pasteSpecialSessionBackingAtom,
  pasteSpecialSessionIdAtom,
  pasteSpecialSessionIdBackingAtom,
  pasteSpecialSupportedKindsAtom,
  pasteSpecialSupportedKindsBackingAtom,
} from './state'
import { DEFAULT_PASTE_SPECIAL_OPTIONS } from './types'
import type {
  PasteSpecialControllerPort,
  PasteSpecialOptions,
  PasteSpecialSessionSnapshot,
} from './types'

/** Close resets the dialog and releases any retained history reservation. */
export function closePasteSpecialSession(get: Getter, set: Setter): void {
  const nextSessionId = nextPasteSpecialSessionId(get(pasteSpecialSessionIdAtom))
  if (nextSessionId !== null) set(pasteSpecialSessionIdBackingAtom, nextSessionId)
  const sessionId = nextSessionId ?? get(pasteSpecialSessionIdAtom)
  const active = get(activePasteSpecialMutationAtom)
  if (active !== null) set(releaseHistoryProducerReservationAtom, active.historyReservation)
  set(activePasteSpecialMutationAtom, null)
  set(pasteSpecialOpenBackingAtom, false)
  set(pasteSpecialSessionBackingAtom, null)
  set(pasteSpecialOptionsBackingAtom, snapshotPasteSpecialOptions(DEFAULT_PASTE_SPECIAL_OPTIONS))
  set(pasteSpecialErrorBackingAtom, '')
  set(pasteSpecialLifecycleBackingAtom, pasteSpecialLifecycle('closed', sessionId, null))
}

export const capturePasteSpecialCapabilityAtom = atom(
  null,
  (get, set, source: PasteSpecialControllerPort) => {
    let available = false
    try {
      available = typeof source?.pasteRange === 'function'
    } catch {
      available = false
    }
    let declaredKinds: unknown
    try {
      declaredKinds = available ? source?.pasteRangeSupportedKinds : undefined
    } catch {
      declaredKinds = undefined
    }
    set(pasteSpecialCapabilityBackingAtom, available)
    set(pasteSpecialSupportedKindsBackingAtom, normalizePasteSpecialSupportedKinds(declaredKinds))
    if (!get(pasteSpecialOpenAtom)) return

    const session = get(pasteSpecialSessionAtom)
    const lifecycle = get(pasteSpecialLifecycleAtom)
    if (
      get(activePasteSpecialMutationAtom) !== null ||
      lifecycle.status === 'pending' ||
      lifecycle.status === 'outcome-unknown' ||
      lifecycle.status === 'local-acknowledged' ||
      lifecycle.status === 'refreshing'
    ) {
      return
    }
    const reason = pasteSpecialSessionBlockReason(
      session,
      available,
      get(pasteSpecialSupportedKindsAtom),
    )
    if (reason !== null) {
      set(pasteSpecialErrorBackingAtom, reason)
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle(
          'blocked',
          session?.sessionId ?? get(pasteSpecialSessionIdAtom),
          session?.sheetId ?? null,
        ),
      )
      return
    }
    if (lifecycle.status === 'blocked') {
      set(pasteSpecialErrorBackingAtom, '')
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('editing', session!.sessionId, session!.sheetId),
      )
    }
  },
)
capturePasteSpecialCapabilityAtom.debugLabel = 'spreadsheet.pasteSpecial.captureCapability'

/** Open and freeze target, clipboard and default options as one Core session. */
export const openPasteSpecialAtom = atom(null, (get, set) => {
  if (get(activePasteSpecialMutationAtom) !== null) return
  if (get(pasteSpecialOpenAtom) && pasteSpecialBlocksClose(get(pasteSpecialLifecycleAtom).status)) {
    return
  }

  const sessionId = nextPasteSpecialSessionId(get(pasteSpecialSessionIdAtom))
  if (sessionId === null) {
    set(pasteSpecialErrorBackingAtom, 'Paste Special session identity space is exhausted.')
    return
  }

  let sheetId: string | null = null
  let target: PasteSpecialSessionSnapshot['target'] = null
  let source: PasteSpecialSessionSnapshot['source'] = null
  let payload: PasteSpecialSessionSnapshot['payload'] = null
  try {
    const selection = get(selectionSnapshotAtom)
    const workspace = get(workspaceSessionAtom)
    const clipboard = get(clipboardStateAtom)
    sheetId = selection.selection.sheetId || workspace.activeSheetId || null
    target = snapshotRange(selection.range)
    source = snapshotSource(clipboard.source)
    payload = snapshotPayload(clipboard.payload)
  } catch {
    // The blocked session below explains that its frozen context is incomplete.
  }

  const supportedKinds = get(pasteSpecialSupportedKindsAtom)
  const options = snapshotPasteSpecialOptions(
    supportedKinds.includes(DEFAULT_PASTE_SPECIAL_OPTIONS.kind) || supportedKinds.length === 0
      ? DEFAULT_PASTE_SPECIAL_OPTIONS
      : { ...DEFAULT_PASTE_SPECIAL_OPTIONS, kind: supportedKinds[0] },
  )
  const session: PasteSpecialSessionSnapshot = Object.freeze({
    sessionId,
    sheetId,
    target,
    source,
    payload,
    options,
  })
  const reason = pasteSpecialSessionBlockReason(
    session,
    get(pasteSpecialCapabilityAtom),
    supportedKinds,
  )
  set(pasteSpecialSessionIdBackingAtom, sessionId)
  set(activePasteSpecialMutationAtom, null)
  set(pasteSpecialSessionBackingAtom, session)
  set(pasteSpecialOptionsBackingAtom, options)
  set(pasteSpecialOpenBackingAtom, true)
  set(pasteSpecialErrorBackingAtom, reason ?? '')
  set(
    pasteSpecialLifecycleBackingAtom,
    pasteSpecialLifecycle(reason === null ? 'editing' : 'blocked', sessionId, sheetId),
  )
})
openPasteSpecialAtom.debugLabel = 'spreadsheet.pasteSpecial.openCommand'

/** Close invalidates the session before any late transport result can commit. */
export const closePasteSpecialAtom = atom(null, (get, set) => {
  if (!get(pasteSpecialCanCloseAtom)) return
  closePasteSpecialSession(get, set)
})
closePasteSpecialAtom.debugLabel = 'spreadsheet.pasteSpecial.closeCommand'

/** Patch the Core draft and the active session atomically. */
export const patchPasteSpecialOptionsAtom = atom(
  null,
  (get, set, patch: Partial<PasteSpecialOptions>) => {
    const lifecycle = get(pasteSpecialLifecycleAtom)
    if (
      lifecycle.status === 'pending' ||
      lifecycle.status === 'outcome-unknown' ||
      lifecycle.status === 'local-acknowledged' ||
      lifecycle.status === 'refreshing' ||
      get(activePasteSpecialMutationAtom) !== null
    ) {
      return
    }
    const next = snapshotPasteSpecialOptions({ ...get(pasteSpecialOptionsAtom), ...patch })
    set(pasteSpecialOptionsBackingAtom, next)

    const session = get(pasteSpecialSessionAtom)
    if (session === null || !get(pasteSpecialOpenAtom)) return
    const nextSession = Object.freeze({ ...session, options: next })
    const reason = pasteSpecialSessionBlockReason(
      nextSession,
      get(pasteSpecialCapabilityAtom),
      get(pasteSpecialSupportedKindsAtom),
    )
    set(pasteSpecialSessionBackingAtom, nextSession)
    set(pasteSpecialErrorBackingAtom, reason ?? '')
    set(
      pasteSpecialLifecycleBackingAtom,
      pasteSpecialLifecycle(
        reason === null ? 'editing' : 'blocked',
        session.sessionId,
        session.sheetId,
      ),
    )
  },
)
patchPasteSpecialOptionsAtom.debugLabel = 'spreadsheet.pasteSpecial.patchOptions'
