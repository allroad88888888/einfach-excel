import type { Getter, Setter } from '@einfach/core'
import { releaseHistoryProducerReservationAtom } from '../history'
import {
  PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR,
  PASTE_SPECIAL_REFRESH_ERROR_PREFIX,
} from './constants'
import { pasteSpecialErrorMessage, pasteSpecialLifecycle } from './session-snapshot'
import { closePasteSpecialSession } from './session-commands'
import {
  activePasteSpecialMutationAtom,
  pasteSpecialErrorBackingAtom,
  pasteSpecialLifecycleAtom,
  pasteSpecialLifecycleBackingAtom,
  pasteSpecialTicketIsCurrent,
} from './state'
import type { PasteSpecialMutationOutcome } from './types'
import type { PasteSpecialMutationTicket } from './mutation-ticket'

type RefreshMode = 'initial' | 'retry'

interface RefreshAcknowledgedPasteInput {
  readonly mode: RefreshMode
  readonly ticket: PasteSpecialMutationTicket
  readonly refreshProjection: (sheetId: string) => Promise<void>
}

/** Refresh and settle a strictly acknowledged mutation without exposing transport state to hosts. */
export async function refreshAcknowledgedPaste(
  get: Getter,
  set: Setter,
  { mode, ticket, refreshProjection }: RefreshAcknowledgedPasteInput,
): Promise<PasteSpecialMutationOutcome> {
  set(pasteSpecialErrorBackingAtom, '')
  if (mode === 'initial') {
    await Promise.resolve()
    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
  }
  set(
    pasteSpecialLifecycleBackingAtom,
    pasteSpecialLifecycle('refreshing', ticket.sessionId, ticket.sheetId, ticket.requestId),
  )
  if (mode === 'retry') {
    await Promise.resolve()
    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
    set(pasteSpecialLifecycleBackingAtom, get(pasteSpecialLifecycleAtom))
  }
  try {
    await refreshProjection(ticket.sheetId)
  } catch (error) {
    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
    set(
      pasteSpecialErrorBackingAtom,
      `${PASTE_SPECIAL_REFRESH_ERROR_PREFIX}${pasteSpecialErrorMessage(error)}`,
    )
    set(
      pasteSpecialLifecycleBackingAtom,
      pasteSpecialLifecycle('error', ticket.sessionId, ticket.sheetId, ticket.requestId),
    )
    return 'error'
  }
  if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
  if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) {
    set(
      pasteSpecialErrorBackingAtom,
      `${PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR} History ownership could not be reconciled after refresh.`,
    )
    set(
      pasteSpecialLifecycleBackingAtom,
      pasteSpecialLifecycle('outcome-unknown', ticket.sessionId, ticket.sheetId, ticket.requestId),
    )
    return 'outcome-unknown'
  }
  set(activePasteSpecialMutationAtom, null)
  closePasteSpecialSession(get, set)
  return 'completed'
}
