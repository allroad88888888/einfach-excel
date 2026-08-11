import { atom } from '@einfach/core'
import type { Atom, Getter } from '@einfach/core'
import { DEFAULT_PASTE_SPECIAL_OPTIONS } from './types'
import type {
  PasteSpecialLifecycleState,
  PasteSpecialOptions,
  PasteSpecialSessionSnapshot,
} from './types'
import { SUPPORTED_PASTE_SPECIAL_KINDS } from './constants'
import {
  pasteSpecialBlocksClose,
  pasteSpecialSessionBlockReason,
  snapshotPasteSpecialOptions,
} from './session-snapshot'
import type { PasteSpecialMutationTicket } from './mutation-ticket'

export const pasteSpecialOpenBackingAtom = atom<boolean>(false)
export const pasteSpecialOptionsBackingAtom = atom<PasteSpecialOptions>(
  snapshotPasteSpecialOptions(DEFAULT_PASTE_SPECIAL_OPTIONS),
)
export const pasteSpecialSessionBackingAtom = atom<PasteSpecialSessionSnapshot | null>(null)
export const pasteSpecialLifecycleBackingAtom = atom<PasteSpecialLifecycleState>({
  status: 'closed',
  sessionId: 0,
  requestId: null,
  sheetId: null,
})
export const pasteSpecialErrorBackingAtom = atom<string>('')
export const pasteSpecialCapabilityBackingAtom = atom<boolean>(false)
export const pasteSpecialSupportedKindsBackingAtom = atom<readonly PasteSpecialOptions['kind'][]>(
  SUPPORTED_PASTE_SPECIAL_KINDS,
)
export const pasteSpecialSessionIdBackingAtom = atom<number>(0)
export const pasteSpecialRequestIdBackingAtom = atom<number>(0)
export const activePasteSpecialMutationAtom = atom<PasteSpecialMutationTicket | null>(null)
activePasteSpecialMutationAtom.debugLabel = 'spreadsheet.pasteSpecial.activeMutation'

/** Whether the Paste Special dialog is visible. Core is its only writer. */
export const pasteSpecialOpenAtom: Atom<boolean> = atom((get) => get(pasteSpecialOpenBackingAtom))
pasteSpecialOpenAtom.debugLabel = 'spreadsheet.pasteSpecial.open'

/** Core-owned form state, mirrored into the active frozen session by the patch command. */
export const pasteSpecialOptionsAtom: Atom<PasteSpecialOptions> = atom((get) =>
  get(pasteSpecialOptionsBackingAtom),
)
pasteSpecialOptionsAtom.debugLabel = 'spreadsheet.pasteSpecial.options'

export const pasteSpecialSessionAtom: Atom<PasteSpecialSessionSnapshot | null> = atom((get) =>
  get(pasteSpecialSessionBackingAtom),
)
pasteSpecialSessionAtom.debugLabel = 'spreadsheet.pasteSpecial.session'

export const pasteSpecialLifecycleAtom: Atom<PasteSpecialLifecycleState> = atom((get) =>
  get(pasteSpecialLifecycleBackingAtom),
)
pasteSpecialLifecycleAtom.debugLabel = 'spreadsheet.pasteSpecial.lifecycle'

export const pasteSpecialErrorAtom: Atom<string> = atom((get) => get(pasteSpecialErrorBackingAtom))
pasteSpecialErrorAtom.debugLabel = 'spreadsheet.pasteSpecial.error'

/** Read-only projection of the capability captured from the active backend. */
export const pasteSpecialCapabilityAtom: Atom<boolean> = atom((get) =>
  get(pasteSpecialCapabilityBackingAtom),
)
pasteSpecialCapabilityAtom.debugLabel = 'spreadsheet.pasteSpecial.capability'

/** Kinds the captured backend really applies. */
export const pasteSpecialSupportedKindsAtom: Atom<readonly PasteSpecialOptions['kind'][]> = atom(
  (get) => get(pasteSpecialSupportedKindsBackingAtom),
)
pasteSpecialSupportedKindsAtom.debugLabel = 'spreadsheet.pasteSpecial.supportedKinds'

export const pasteSpecialSessionIdAtom: Atom<number> = atom((get) =>
  get(pasteSpecialSessionIdBackingAtom),
)
pasteSpecialSessionIdAtom.debugLabel = 'spreadsheet.pasteSpecial.sessionId'

export const pasteSpecialRequestIdAtom: Atom<number> = atom((get) =>
  get(pasteSpecialRequestIdBackingAtom),
)
pasteSpecialRequestIdAtom.debugLabel = 'spreadsheet.pasteSpecial.requestId'

export const pasteSpecialCanEditAtom = atom((get) => {
  const lifecycle = get(pasteSpecialLifecycleAtom)
  return (
    get(pasteSpecialOpenAtom) &&
    get(activePasteSpecialMutationAtom) === null &&
    (lifecycle.status === 'editing' ||
      lifecycle.status === 'blocked' ||
      lifecycle.status === 'error')
  )
})
pasteSpecialCanEditAtom.debugLabel = 'spreadsheet.pasteSpecial.canEdit'

export const pasteSpecialCanConfirmAtom = atom((get) => {
  const lifecycle = get(pasteSpecialLifecycleAtom)
  return (
    get(pasteSpecialOpenAtom) &&
    get(pasteSpecialCapabilityAtom) &&
    pasteSpecialSessionBlockReason(
      get(pasteSpecialSessionAtom),
      true,
      get(pasteSpecialSupportedKindsAtom),
    ) === null &&
    (lifecycle.status === 'editing' ||
      lifecycle.status === 'blocked' ||
      lifecycle.status === 'error')
  )
})
pasteSpecialCanConfirmAtom.debugLabel = 'spreadsheet.pasteSpecial.canConfirm'

/** Close stays unavailable while a launched mutation needs bookkeeping. */
export const pasteSpecialCanCloseAtom = atom(
  (get) =>
    get(pasteSpecialOpenAtom) && !pasteSpecialBlocksClose(get(pasteSpecialLifecycleAtom).status),
)
pasteSpecialCanCloseAtom.debugLabel = 'spreadsheet.pasteSpecial.canClose'

export function pasteSpecialSessionAuthorityIsCurrent(
  get: Getter,
  session: PasteSpecialSessionSnapshot,
  lifecycle: PasteSpecialLifecycleState,
): boolean {
  return (
    get(activePasteSpecialMutationAtom) === null &&
    get(pasteSpecialOpenAtom) &&
    get(pasteSpecialSessionAtom) === session &&
    get(pasteSpecialSessionIdAtom) === session.sessionId &&
    get(pasteSpecialLifecycleAtom) === lifecycle
  )
}

/** A transport result may proceed only while its frozen session is still authoritative. */
export function pasteSpecialTicketIsCurrent(
  get: Getter,
  ticket: PasteSpecialMutationTicket,
): boolean {
  const active = get(activePasteSpecialMutationAtom)
  const lifecycle = get(pasteSpecialLifecycleAtom)
  const session = get(pasteSpecialSessionAtom)
  return (
    active === ticket &&
    get(pasteSpecialOpenAtom) &&
    get(pasteSpecialSessionIdAtom) === ticket.sessionId &&
    session === ticket.sessionWitness &&
    session.sheetId === ticket.sheetId &&
    lifecycle.sessionId === ticket.sessionId &&
    lifecycle.requestId === ticket.requestId
  )
}
