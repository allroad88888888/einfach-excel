/**
 * Serialized Rust-backed editing transaction state machine.
 *
 * Order is part of correctness: capture session -> validate gateway -> publish ticket -> mutate ->
 * validate acknowledgement -> refresh -> finish.
 * Caller-controlled reads and async boundaries recheck ownership; consecutive internal atom writes
 * form one ordered publication phase guarded by the active ticket.
 */
import { atom } from '@einfach/core'
import { editingErrorMessage, runBoundedEditingOperation } from './bounded-operation'
import { captureEditingCommitInput, snapshotEditingAcknowledgement } from './commit-input'
import {
  activeEditingCommitTicketAtom,
  captureEditingSessionSnapshot,
  editingCommitLifecycleBackingAtom,
  editingIntentBackingAtom,
  editingRawTransportStateAtom,
  editingRequestSequenceAtom,
  editingSessionSnapshotIsCurrent,
  editingSessionBackingAtom,
  editingTicketIsCurrent,
  lifecycleFor,
  lifecycleForTicket,
  markEditingRawTransportSettled,
  nextSafeEditingIdentity,
  type EditingCommitTicket,
} from './commit-state'
import { completeEditingTicket, rejectEditingTicket } from './commit-settlement'
import { createEditingCommitTicket } from './commit-ticket'
import {
  acquireEditingHistoryProjection,
  recordEditingHistoryProjection,
  releaseEditingHistoryProjection,
} from './history-projection'
import { resolveContentMutationAtom } from './mutation-gateway'
import { commitEditingSessionState, createEditingCommitIntent } from './session-domain'
import type { EditingCommitOutcome, RunEditingCommitInput } from './types'

/** Runs one edit from draft capture through the refreshed projection. */
export const runEditingCommitAtom = atom(
  null,
  async (get, set, input: RunEditingCommitInput): Promise<EditingCommitOutcome> => {
    if (get(activeEditingCommitTicketAtom) !== null) return 'blocked'
    const snapshot = captureEditingSessionSnapshot(get)
    const state = snapshot.session
    if (state.status !== 'drafting' || state.source === null) return 'blocked'

    // Capturing input reads caller-owned getters; discard it if that read changed authority.
    const captured = captureEditingCommitInput(input)
    if (!editingSessionSnapshotIsCurrent(get, snapshot)) return 'blocked'
    if (captured.kind === 'invalid') {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleFor('blocked', {
          sessionId: snapshot.sequence,
          sheetId: state.source.sheetId,
          cell: state.source.cell,
          error: 'Editing commit transport or projection refresh is unavailable.',
        }),
      )
      return 'blocked'
    }

    const stagedSession = commitEditingSessionState(state, {
      input: state.draft,
      move: captured.move,
      source: captured.commitSource,
    })
    const derivedIntent = createEditingCommitIntent(stagedSession, {
      input: stagedSession.draft,
      move: captured.move,
      source: captured.commitSource,
    })
    if (derivedIntent === null) return 'blocked'

    // The gateway may publish diagnostics and synchronously notify subscribers.
    const resolution = set(resolveContentMutationAtom, {
      kind: 'set-cell-input',
      sheetId: derivedIntent.sheetId,
      cell: derivedIntent.cell,
    })
    if (!editingSessionSnapshotIsCurrent(get, snapshot)) return 'blocked'
    if (resolution.status === 'blocked') {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleFor('blocked', {
          sessionId: snapshot.sequence,
          sheetId: derivedIntent.sheetId,
          cell: derivedIntent.cell,
          error: resolution.diagnostic.message,
        }),
      )
      return 'blocked'
    }
    const targetCell = resolution.cell ?? derivedIntent.cell

    const requestId = nextSafeEditingIdentity(get(editingRequestSequenceAtom))
    if (requestId === null) {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleFor('blocked', {
          sessionId: snapshot.sequence,
          sheetId: derivedIntent.sheetId,
          cell: targetCell,
          error: 'Editing commit request identity space is exhausted.',
        }),
      )
      return 'blocked'
    }
    // Rust owns the undo images. UI core reserves only the lightweight timeline
    // descriptor so its cursor stays positionally aligned with the backend log.
    const capturedHistoryReservation = acquireEditingHistoryProjection(
      set,
      captured.supportsHistoryReplay,
    )
    if (capturedHistoryReservation === null) return 'blocked'
    const historyReservation = capturedHistoryReservation ?? null
    if (capturedHistoryReservation !== undefined) {
      // Reservation notifications may synchronously replace the draft session.
      await Promise.resolve()
      if (!editingSessionSnapshotIsCurrent(get, snapshot)) {
        releaseEditingHistoryProjection(set, historyReservation)
        return 'blocked'
      }
    }

    const ticket = createEditingCommitTicket({
      sessionId: snapshot.sequence,
      requestId,
      derivedIntent,
      targetCell,
      captured,
      historyReservation,
    })

    // Publish the private serialization gate first so every public re-entry observes a busy lane.
    set(activeEditingCommitTicketAtom, ticket)
    if (get(activeEditingCommitTicketAtom) !== ticket) return 'blocked'
    set(editingRequestSequenceAtom, requestId)
    set(editingRawTransportStateAtom, null)
    set(editingSessionBackingAtom, stagedSession)
    set(editingIntentBackingAtom, ticket.intent)
    const pendingLifecycle = lifecycleForTicket('pending', ticket)
    set(editingCommitLifecycleBackingAtom, pendingLifecycle)

    set(
      editingRawTransportStateAtom,
      Object.freeze({ requestId: ticket.requestId, settled: false }),
    )
    if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return 'blocked'

    // Only launch after raw transport state exists; reconciliation relies on this settlement bit.
    let rawTransport: Promise<Awaited<ReturnType<EditingCommitTicket['execute']>>>
    try {
      rawTransport = Promise.resolve(ticket.execute.call(ticket.source, ticket.request))
    } catch (error) {
      const detail = editingErrorMessage(error)
      markEditingRawTransportSettled(set, ticket)
      return rejectEditingTicket(
        get,
        set,
        ticket,
        pendingLifecycle,
        `Editing commit was rejected and may be retried: ${detail}`,
      )
    }
    // Observe both continuations even if the bounded wait times out and returns first.
    const observedTransport = rawTransport.then(
      (value) => {
        markEditingRawTransportSettled(set, ticket)
        return value
      },
      (error: unknown) => {
        markEditingRawTransportSettled(set, ticket)
        throw error
      },
    )

    const transportResult = await runBoundedEditingOperation(
      () => observedTransport,
      ticket.timeoutMs,
    )
    if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return 'blocked'
    if (transportResult.kind === 'timeout') {
      // The backend may still commit later; retain ticket and history ownership for reconciliation.
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'outcome-unknown',
          ticket,
          null,
          'Editing commit timed out; its backend outcome is unknown.',
        ),
      )
      return 'outcome-unknown'
    }
    if (transportResult.kind === 'rejected') {
      const detail = editingErrorMessage(transportResult.error)
      return rejectEditingTicket(
        get,
        set,
        ticket,
        pendingLifecycle,
        `Editing commit was rejected and may be retried: ${detail}`,
      )
    }

    // ACK getters are untrusted, hence the authority check immediately after snapshotting them.
    const acknowledgement = snapshotEditingAcknowledgement(transportResult.value, ticket)
    if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return 'blocked'
    if (acknowledgement === null) {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'outcome-unknown',
          ticket,
          null,
          'Editing acknowledgement did not exactly match the active request.',
        ),
      )
      return 'outcome-unknown'
    }

    if (ticket.historyReservation !== null) {
      const recorded = recordEditingHistoryProjection(set, ticket, acknowledgement)
      if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return 'blocked'
      if (!recorded) {
        set(
          editingCommitLifecycleBackingAtom,
          lifecycleForTicket(
            'outcome-unknown',
            ticket,
            acknowledgement.revision,
            'Editing mutation was acknowledged, but its UI history descriptor was unavailable.',
          ),
        )
        return 'outcome-unknown'
      }
    }

    const acknowledgedLifecycle = lifecycleForTicket(
      'local-acknowledged',
      ticket,
      acknowledgement.revision,
    )
    set(editingCommitLifecycleBackingAtom, acknowledgedLifecycle)

    // Expose local acknowledgement for one turn before projection refresh begins.
    await Promise.resolve()
    if (!editingTicketIsCurrent(get, ticket, acknowledgedLifecycle)) return 'blocked'
    const refreshingLifecycle = lifecycleForTicket('refreshing', ticket, acknowledgement.revision)
    set(editingCommitLifecycleBackingAtom, refreshingLifecycle)

    const refreshResult = await runBoundedEditingOperation(
      () => ticket.refreshProjection(ticket.request.sheetId),
      ticket.timeoutMs,
    )
    if (!editingTicketIsCurrent(get, ticket, refreshingLifecycle)) return 'blocked'
    if (refreshResult.kind === 'timeout') {
      // Mutation is already acknowledged: retain the same ticket and retry only the refresh.
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'refresh-failed',
          ticket,
          acknowledgement.revision,
          'Editing mutation was acknowledged, but projection refresh timed out.',
        ),
      )
      return 'refresh-failed'
    }
    if (refreshResult.kind === 'rejected') {
      const detail = editingErrorMessage(refreshResult.error)
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'refresh-failed',
          ticket,
          acknowledgement.revision,
          `Editing mutation was acknowledged, but refresh failed: ${detail}`,
        ),
      )
      return 'refresh-failed'
    }

    return completeEditingTicket(get, set, ticket, refreshingLifecycle)
  },
)
runEditingCommitAtom.debugLabel = 'spreadsheet.editing.runCommit'
