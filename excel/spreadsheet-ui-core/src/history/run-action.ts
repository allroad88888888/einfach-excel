import type { Getter, Setter } from '@einfach/core'
import type {
  HistoryAction,
  HistoryCommandOutcome,
  HistoryEntry,
  HistoryMutationResult,
  HistoryRedoRequest,
  HistoryUndoRequest,
  RunHistoryCommandInput,
} from './types'
import {
  HISTORY_ACKNOWLEDGEMENT_ERROR,
  HISTORY_CAPABILITY_ERROR,
  HISTORY_LOCAL_REPLAY_ERROR,
  HISTORY_NOT_APPLIED_ERROR,
  HISTORY_REVISION_ERROR,
} from './constants'
import { getHistoryLocalReplayApplier } from './local-replay'
import { isProjectionRevision, nextSafeMonotonicIdentity } from './identity'
import {
  lifecycleFor,
  lifecycleForTicket,
  stackState,
  type HistoryMutationTicket,
  type HistoryStackBackingState,
} from './backing-state'
import {
  errorMessage,
  normalizeTimeout,
  outcomeUnknownError,
  refreshFailureError,
  snapshotAcknowledgement,
  withTimeout,
} from './transport'
import {
  activeHistoryProducerReservationAtom,
  activeHistoryTicketAtom,
  historyLifecycleBackingAtom,
  historyProjectionRevisionBackingAtom,
  historyRequestSequenceAtom,
  historySessionSequenceAtom,
  historyStackBackingAtom,
} from './backing-atoms'
import {
  acquireHistoryProducerReservationAtom,
  releaseHistoryProducerReservationAtom,
} from './producer-lane'

function historyWitnessOwnsEntry(
  get: Getter,
  action: HistoryAction,
  historyWitness: HistoryStackBackingState,
  entry: HistoryEntry,
): boolean {
  const currentStack = get(historyStackBackingAtom)
  if (currentStack !== historyWitness || currentStack.cursor !== historyWitness.cursor) return false
  const expectedEntry =
    action === 'undo'
      ? currentStack.entries[historyWitness.cursor - 1]
      : currentStack.entries[historyWitness.cursor]
  return expectedEntry === entry
}

export async function runHistoryAction(
  action: HistoryAction,
  get: Getter,
  set: Setter,
  input: RunHistoryCommandInput,
): Promise<HistoryCommandOutcome> {
  if (get(activeHistoryTicketAtom) !== null || get(activeHistoryProducerReservationAtom) !== null) {
    return 'blocked'
  }

  const historyWitness = get(historyStackBackingAtom)
  const entry =
    action === 'undo'
      ? historyWitness.entries[historyWitness.cursor - 1]
      : historyWitness.entries[historyWitness.cursor]
  if (!entry) return 'blocked'

  // Local-replay entries close their loop inside UI-core: no backend
  // transport, no revision witness, no ticket. The shared producer lane
  // still guards the full synchronous apply -> cursor/lifecycle commit
  // window: persistence hooks invoked by an applier are caller-owned code
  // and may otherwise re-enter a producer or another history action.
  const localReplay = entry.localReplay
  if (localReplay) {
    const reservation = set(acquireHistoryProducerReservationAtom)
    if (reservation === null) return 'blocked'
    const ownsReservation = (): boolean =>
      get(activeHistoryProducerReservationAtom) === reservation &&
      get(activeHistoryTicketAtom) === null
    const ownsHistoryWitness = (): boolean =>
      historyWitnessOwnsEntry(get, action, historyWitness, entry)
    try {
      if (!ownsReservation() || !ownsHistoryWitness()) return 'blocked'
      let source: RunHistoryCommandInput['source']
      try {
        // Caller-owned command input is read once, while the exact producer
        // reservation makes synchronous re-entry inert.
        source = input.source
      } catch {
        if (ownsReservation() && ownsHistoryWitness()) {
          set(
            historyLifecycleBackingAtom,
            lifecycleFor('blocked', {
              sessionId: get(historySessionSequenceAtom),
              action,
              transactionId: entry.transactionId,
              error: HISTORY_LOCAL_REPLAY_ERROR,
            }),
          )
        }
        return 'blocked'
      }
      if (!ownsReservation() || !ownsHistoryWitness()) return 'blocked'
      const applier = getHistoryLocalReplayApplier(localReplay.applyKey)
      const applied = applier !== null && applier(get, set, localReplay, action, source)
      if (!applied || !ownsReservation()) {
        if (ownsReservation() && ownsHistoryWitness()) {
          set(
            historyLifecycleBackingAtom,
            lifecycleFor('blocked', {
              sessionId: get(historySessionSequenceAtom),
              action,
              transactionId: entry.transactionId,
              error: HISTORY_LOCAL_REPLAY_ERROR,
            }),
          )
        }
        return 'blocked'
      }

      if (!ownsHistoryWitness()) return 'blocked'

      set(
        historyStackBackingAtom,
        stackState(historyWitness.entries, historyWitness.cursor + (action === 'undo' ? -1 : 1)),
      )
      set(
        historyLifecycleBackingAtom,
        lifecycleFor('ready', { sessionId: get(historySessionSequenceAtom) }),
      )
      return 'completed'
    } catch {
      if (ownsReservation() && ownsHistoryWitness()) {
        set(
          historyLifecycleBackingAtom,
          lifecycleFor('blocked', {
            sessionId: get(historySessionSequenceAtom),
            action,
            transactionId: entry.transactionId,
            error: HISTORY_LOCAL_REPLAY_ERROR,
          }),
        )
      }
      return 'blocked'
    } finally {
      set(releaseHistoryProducerReservationAtom, reservation)
    }
  }

  const revision = get(historyProjectionRevisionBackingAtom)
  if (!isProjectionRevision(revision)) {
    set(
      historyLifecycleBackingAtom,
      lifecycleFor('blocked', {
        sessionId: get(historySessionSequenceAtom),
        action,
        transactionId: entry.transactionId,
        error: HISTORY_REVISION_ERROR,
      }),
    )
    return 'blocked'
  }

  const sessionId = nextSafeMonotonicIdentity(get(historySessionSequenceAtom))
  const requestId = nextSafeMonotonicIdentity(get(historyRequestSequenceAtom))
  if (sessionId === null || requestId === null) {
    set(
      historyLifecycleBackingAtom,
      lifecycleFor('blocked', {
        sessionId: get(historySessionSequenceAtom),
        action,
        transactionId: entry.transactionId,
        revision,
        error: 'History identity space is exhausted.',
      }),
    )
    return 'blocked'
  }

  // Use the shared producer reservation as an atomic preparation guard. It is
  // acquired before any caller-owned getter, then handed off to the immutable
  // history ticket without ever opening the lane between the two owners.
  const preparationReservation = set(acquireHistoryProducerReservationAtom)
  if (preparationReservation === null) return 'blocked'
  const ownsPreparation = (): boolean =>
    get(activeHistoryProducerReservationAtom) === preparationReservation &&
    get(activeHistoryTicketAtom) === null &&
    get(historyProjectionRevisionBackingAtom) === revision &&
    historyWitnessOwnsEntry(get, action, historyWitness, entry)

  let preparedTicket: HistoryMutationTicket | null = null
  try {
    if (!ownsPreparation()) return 'blocked'

    let source: RunHistoryCommandInput['source']
    let execute:
      | ((request: HistoryUndoRequest | HistoryRedoRequest) => Promise<HistoryMutationResult>)
      | undefined
    let refreshProjection: RunHistoryCommandInput['refreshProjection']
    let timeoutMs: number
    try {
      source = input.source
      if (!ownsPreparation()) return 'blocked'
      execute = (
        action === 'undo' ? source?.undoTransaction : source?.redoTransaction
      ) as typeof execute
      if (!ownsPreparation()) return 'blocked'
      refreshProjection = input.refreshProjection
      if (!ownsPreparation()) return 'blocked'
      const timeoutValue = input.timeoutMs
      if (!ownsPreparation()) return 'blocked'
      timeoutMs = normalizeTimeout(timeoutValue)
    } catch {
      if (ownsPreparation()) {
        set(
          historyLifecycleBackingAtom,
          lifecycleFor('blocked', {
            sessionId: get(historySessionSequenceAtom),
            action,
            transactionId: entry.transactionId,
            revision,
            error: HISTORY_CAPABILITY_ERROR,
          }),
        )
      }
      return 'blocked'
    }

    if (
      (typeof source !== 'object' && typeof source !== 'function') ||
      source === null ||
      typeof execute !== 'function' ||
      typeof refreshProjection !== 'function' ||
      !ownsPreparation()
    ) {
      if (ownsPreparation()) {
        set(
          historyLifecycleBackingAtom,
          lifecycleFor('blocked', {
            sessionId: get(historySessionSequenceAtom),
            action,
            transactionId: entry.transactionId,
            revision,
            error: HISTORY_CAPABILITY_ERROR,
          }),
        )
      }
      return 'blocked'
    }

    const request = Object.freeze({
      kind: action === 'undo' ? ('undo-transaction' as const) : ('redo-transaction' as const),
      transactionId: entry.transactionId,
      requestId,
      revision,
    }) as HistoryUndoRequest | HistoryRedoRequest
    preparedTicket = Object.freeze({
      sessionId,
      action,
      transactionId: entry.transactionId,
      requestId,
      revision,
      cursorBefore: historyWitness.cursor,
      cursorAfter: historyWitness.cursor + (action === 'undo' ? -1 : 1),
      historyWitness,
      entry,
      request,
      source,
      execute,
      refreshProjection,
      timeoutMs,
    })
    set(historySessionSequenceAtom, sessionId)
    set(historyRequestSequenceAtom, requestId)
    set(activeHistoryTicketAtom, preparedTicket)
    set(historyLifecycleBackingAtom, lifecycleForTicket('pending', preparedTicket))
  } finally {
    // The active ticket (when preparation succeeded) already blocks re-entry.
    // Exact reservation release is the final preparation write.
    set(releaseHistoryProducerReservationAtom, preparationReservation)
  }

  const ticket = preparedTicket
  if (ticket === null) return 'blocked'

  const ownsTicket = (): boolean => {
    const lifecycle = get(historyLifecycleBackingAtom)
    return (
      get(activeHistoryTicketAtom) === ticket &&
      lifecycle.sessionId === ticket.sessionId &&
      lifecycle.requestId === ticket.requestId &&
      lifecycle.action === ticket.action &&
      lifecycle.transactionId === ticket.transactionId &&
      lifecycle.revision === ticket.revision
    )
  }
  const ownsOriginalAuthority = (): boolean =>
    ownsTicket() &&
    get(historyProjectionRevisionBackingAtom) === ticket.revision &&
    historyWitnessOwnsEntry(get, ticket.action, ticket.historyWitness, ticket.entry)

  // Publish the immutable reservation before transport launch. Same-tick re-entry is inert.
  await Promise.resolve()
  if (!ownsOriginalAuthority()) return 'blocked'
  // Einfach publishes the first async-write flush on a post-await setter.
  set(historyLifecycleBackingAtom, get(historyLifecycleBackingAtom))

  let acknowledgement: unknown
  try {
    acknowledgement = await withTimeout(
      Promise.resolve().then(() => ticket.execute.call(ticket.source, ticket.request)),
      ticket.timeoutMs,
      `History ${action}`,
    )
  } catch (error) {
    if (!ownsOriginalAuthority()) return 'blocked'
    set(
      historyLifecycleBackingAtom,
      lifecycleForTicket('outcome-unknown', ticket, null, outcomeUnknownError(errorMessage(error))),
    )
    return 'outcome-unknown'
  }

  if (!ownsOriginalAuthority()) return 'blocked'
  const acknowledgementSnapshot = snapshotAcknowledgement(acknowledgement, ticket)
  // Snapshot getters are caller-owned and may synchronously re-enter Core.
  // Correlation is acted upon only while the exact ticket and pre-ACK stack
  // witness still own the lane.
  if (!ownsOriginalAuthority()) return 'blocked'
  // Structured not-applied detection (design point C). `applied: false`,
  // once correlated to the exact ticket, is a POSITIVE backend statement
  // that nothing was replayed — the cursor must not move and the
  // acknowledged revision must not be committed as the new witness. The
  // lifecycle still lands on the outcome-unknown convention (rather than a
  // releasing 'blocked') because the UI-visible history stack now disagrees
  // with what the backend can replay: re-sending the same undo/redo risks a
  // double-apply if the backend's "not applied" was itself stale or racy.
  // The lane stays locked; hosts recover by reloading or reconciling
  // workbook data before another history action, never by an automatic retry.
  if (acknowledgementSnapshot.kind === 'not-applied') {
    const detail =
      acknowledgementSnapshot.reason.length > 0
        ? `${HISTORY_NOT_APPLIED_ERROR} ${acknowledgementSnapshot.reason}`
        : HISTORY_NOT_APPLIED_ERROR
    set(
      historyLifecycleBackingAtom,
      lifecycleForTicket('outcome-unknown', ticket, null, outcomeUnknownError(detail)),
    )
    return 'outcome-unknown'
  }
  if (acknowledgementSnapshot.kind === 'malformed') {
    set(
      historyLifecycleBackingAtom,
      lifecycleForTicket(
        'outcome-unknown',
        ticket,
        null,
        outcomeUnknownError(HISTORY_ACKNOWLEDGEMENT_ERROR),
      ),
    )
    return 'outcome-unknown'
  }
  const acknowledgedRevision = acknowledgementSnapshot.revision
  const committedStack = stackState(ticket.historyWitness.entries, ticket.cursorAfter)
  set(historyStackBackingAtom, committedStack)
  set(historyProjectionRevisionBackingAtom, acknowledgedRevision)
  const ownsCommittedAuthority = (): boolean =>
    ownsTicket() &&
    get(historyStackBackingAtom) === committedStack &&
    get(historyProjectionRevisionBackingAtom) === acknowledgedRevision
  // Backend-transaction entries may carry side payloads for UI-core
  // canonical view facts the transaction displaced (freeze band, hidden
  // sets). The backend has already replayed its own facts; restore the
  // local ones through the same stateless applier registry. The backend
  // outcome is committed, so an applier miss cannot roll it back — the
  // local restore is best-effort by construction.
  const localSidePayloads = ticket.entry.localSidePayloads
  if (localSidePayloads) {
    for (const payload of localSidePayloads) {
      if (!ownsCommittedAuthority()) return 'blocked'
      const applier = getHistoryLocalReplayApplier(payload.applyKey)
      if (applier !== null) {
        try {
          applier(get, set, payload, ticket.action, ticket.source)
        } catch {
          // The backend transaction is already committed. A local side
          // projection is best-effort and cannot roll the backend back.
        }
        if (!ownsCommittedAuthority()) return 'blocked'
      }
    }
  }
  if (!ownsCommittedAuthority()) return 'blocked'
  set(
    historyLifecycleBackingAtom,
    lifecycleForTicket('local-acknowledged', ticket, acknowledgedRevision),
  )

  await Promise.resolve()
  if (!ownsCommittedAuthority()) return 'blocked'
  set(historyLifecycleBackingAtom, lifecycleForTicket('refreshing', ticket, acknowledgedRevision))
  try {
    await withTimeout(
      Promise.resolve().then(ticket.refreshProjection),
      ticket.timeoutMs,
      'History refresh',
    )
  } catch (error) {
    if (!ownsCommittedAuthority()) return 'blocked'
    set(
      historyLifecycleBackingAtom,
      lifecycleForTicket(
        'refresh-failed',
        ticket,
        acknowledgedRevision,
        refreshFailureError(error),
      ),
    )
    return 'refresh-failed'
  }

  if (!ownsCommittedAuthority()) return 'blocked'
  set(historyLifecycleBackingAtom, lifecycleFor('ready', { sessionId: ticket.sessionId }))
  if (get(activeHistoryTicketAtom) !== ticket) return 'blocked'
  // Clearing is the last write. A synchronous subscriber may start the next
  // history command from this notification and the completed call is inert.
  set(activeHistoryTicketAtom, null)
  return 'completed'
}
