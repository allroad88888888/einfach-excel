import { atom } from '@einfach/core'
import { acquireHistoryProducerReservationAtom, pushReservedHistoryAtom } from '../history'
import {
  PASTE_SPECIAL_ACKNOWLEDGEMENT_ERROR,
  PASTE_SPECIAL_CAPABILITY_ERROR,
  PASTE_SPECIAL_CONTEXT_ERROR,
  PASTE_SPECIAL_HISTORY_BUSY_ERROR,
  PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR,
} from './constants'
import { snapshotPasteSpecialAcknowledgement } from './mutation-ticket'
import { refreshAcknowledgedPaste } from './refresh-acknowledged-paste'
import {
  nextPasteSpecialRequestId,
  pasteSpecialErrorMessage,
  pasteSpecialLifecycle,
  pasteSpecialSessionBlockReason,
} from './session-snapshot'
import {
  activePasteSpecialMutationAtom,
  pasteSpecialCapabilityAtom,
  pasteSpecialErrorBackingAtom,
  pasteSpecialLifecycleAtom,
  pasteSpecialLifecycleBackingAtom,
  pasteSpecialOpenAtom,
  pasteSpecialRequestIdAtom,
  pasteSpecialRequestIdBackingAtom,
  pasteSpecialSessionAtom,
  pasteSpecialSessionAuthorityIsCurrent,
  pasteSpecialSupportedKindsAtom,
  pasteSpecialTicketIsCurrent,
} from './state'
import type {
  ConfirmPasteSpecialInput,
  PasteRangeRequest,
  PasteSpecialControllerPort,
  PasteSpecialMutationOutcome,
} from './types'
import type { PasteSpecialMutationTicket } from './mutation-ticket'

/** Core owns transport reservation, strict acknowledgement, history, refresh and retry. */
export const confirmPasteSpecialAtom = atom(
  null,
  async (get, set, input: ConfirmPasteSpecialInput): Promise<PasteSpecialMutationOutcome> => {
    let source: PasteSpecialControllerPort
    let inputSessionId: number
    let refreshProjection: ((sheetId: string) => Promise<void>) | undefined
    try {
      source = input.source
      inputSessionId = input.sessionId
      refreshProjection = input.refreshProjection
    } catch {
      return 'stale'
    }

    const active = get(activePasteSpecialMutationAtom)
    if (active !== null) {
      const lifecycle = get(pasteSpecialLifecycleAtom)
      if (
        active.acknowledgement === null ||
        inputSessionId !== active.sessionId ||
        lifecycle.status !== 'error' ||
        typeof refreshProjection !== 'function'
      ) {
        return lifecycle.status === 'outcome-unknown' ? 'blocked' : 'stale'
      }
      return refreshAcknowledgedPaste(get, set, {
        mode: 'retry',
        ticket: active,
        refreshProjection,
      })
    }

    const session = get(pasteSpecialSessionAtom)
    const lifecycle = get(pasteSpecialLifecycleAtom)
    if (
      !get(pasteSpecialOpenAtom) ||
      session === null ||
      inputSessionId !== session.sessionId ||
      lifecycle.sessionId !== session.sessionId ||
      lifecycle.status === 'pending' ||
      lifecycle.status === 'outcome-unknown' ||
      lifecycle.status === 'local-acknowledged' ||
      lifecycle.status === 'refreshing'
    ) {
      return 'stale'
    }

    const reason = pasteSpecialSessionBlockReason(
      session,
      get(pasteSpecialCapabilityAtom),
      get(pasteSpecialSupportedKindsAtom),
    )
    if (reason !== null || typeof refreshProjection !== 'function') {
      set(pasteSpecialErrorBackingAtom, reason ?? PASTE_SPECIAL_CONTEXT_ERROR)
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('blocked', session.sessionId, session.sheetId),
      )
      return 'blocked'
    }

    let execute: PasteSpecialControllerPort['pasteRange']
    try {
      execute = source?.pasteRange
    } catch {
      execute = undefined
    }
    if (!pasteSpecialSessionAuthorityIsCurrent(get, session, lifecycle)) return 'stale'
    if (typeof execute !== 'function') {
      set(pasteSpecialErrorBackingAtom, PASTE_SPECIAL_CAPABILITY_ERROR)
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('blocked', session.sessionId, session.sheetId),
      )
      return 'blocked'
    }

    const requestId = nextPasteSpecialRequestId(get(pasteSpecialRequestIdAtom))
    if (requestId === null) {
      set(pasteSpecialErrorBackingAtom, 'Paste Special request identity space is exhausted.')
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('blocked', session.sessionId, session.sheetId),
      )
      return 'blocked'
    }

    const request: PasteRangeRequest = Object.freeze({
      kind: 'paste-range',
      sheetId: session.sheetId!,
      target: session.target!,
      source: Object.freeze({
        sheetId: session.source!.sheetId,
        range: session.source!.range,
        payload: session.payload,
      }),
      pasteKind: session.options.kind,
      op: session.options.op,
      transpose: session.options.transpose,
      skipBlanks: session.options.skipBlanks,
      requestId,
    })
    if (!pasteSpecialSessionAuthorityIsCurrent(get, session, lifecycle)) return 'stale'
    const historyReservation = set(acquireHistoryProducerReservationAtom)
    if (historyReservation === null) {
      set(pasteSpecialErrorBackingAtom, PASTE_SPECIAL_HISTORY_BUSY_ERROR)
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('blocked', session.sessionId, session.sheetId),
      )
      return 'blocked'
    }
    const ticket: PasteSpecialMutationTicket = Object.freeze({
      sessionId: session.sessionId,
      requestId,
      sheetId: session.sheetId!,
      sessionWitness: session,
      target: session.target!,
      request,
      historyReservation,
      acknowledgement: null,
    })
    set(pasteSpecialRequestIdBackingAtom, requestId)
    set(activePasteSpecialMutationAtom, ticket)
    set(pasteSpecialErrorBackingAtom, '')
    set(
      pasteSpecialLifecycleBackingAtom,
      pasteSpecialLifecycle('pending', ticket.sessionId, ticket.sheetId, requestId),
    )

    await Promise.resolve()
    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
    set(pasteSpecialLifecycleBackingAtom, get(pasteSpecialLifecycleAtom))
    let acknowledgement: unknown
    try {
      acknowledgement = await execute.call(source, ticket.request)
    } catch (error) {
      if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
      set(
        pasteSpecialErrorBackingAtom,
        `${PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR} Backend detail: ${pasteSpecialErrorMessage(error)}`,
      )
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('outcome-unknown', ticket.sessionId, ticket.sheetId, requestId),
      )
      return 'outcome-unknown'
    }

    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
    const acknowledgementSnapshot = snapshotPasteSpecialAcknowledgement(acknowledgement, ticket)
    if (!pasteSpecialTicketIsCurrent(get, ticket)) return 'stale'
    if (acknowledgementSnapshot === null) {
      set(
        pasteSpecialErrorBackingAtom,
        `${PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR} ${PASTE_SPECIAL_ACKNOWLEDGEMENT_ERROR}`,
      )
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('outcome-unknown', ticket.sessionId, ticket.sheetId, requestId),
      )
      return 'outcome-unknown'
    }

    const acknowledgedTicket: PasteSpecialMutationTicket = Object.freeze({
      ...ticket,
      acknowledgement: acknowledgementSnapshot,
    })
    set(activePasteSpecialMutationAtom, acknowledgedTicket)
    const historyRecorded = set(pushReservedHistoryAtom, {
      reservation: ticket.historyReservation,
      entry: {
        transactionId: `paste-special-${ticket.sessionId}-${ticket.requestId}`,
        kind: 'cells.import',
        sheetId: ticket.sheetId,
        projectionRevision: acknowledgementSnapshot.revision,
        affectedRange: acknowledgementSnapshot.affectedRange,
      },
    })
    if (!pasteSpecialTicketIsCurrent(get, acknowledgedTicket)) return 'stale'
    if (!historyRecorded) {
      set(
        pasteSpecialErrorBackingAtom,
        `${PASTE_SPECIAL_OUTCOME_UNKNOWN_ERROR} History ownership was unavailable after acknowledgement.`,
      )
      set(
        pasteSpecialLifecycleBackingAtom,
        pasteSpecialLifecycle('outcome-unknown', ticket.sessionId, ticket.sheetId, requestId),
      )
      return 'outcome-unknown'
    }
    set(
      pasteSpecialLifecycleBackingAtom,
      pasteSpecialLifecycle('local-acknowledged', ticket.sessionId, ticket.sheetId, requestId),
    )
    return refreshAcknowledgedPaste(get, set, {
      mode: 'initial',
      ticket: acknowledgedTicket,
      refreshProjection,
    })
  },
)
confirmPasteSpecialAtom.debugLabel = 'spreadsheet.pasteSpecial.confirm'
