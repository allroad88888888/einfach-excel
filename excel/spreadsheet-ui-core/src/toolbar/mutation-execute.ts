import type { Getter, Setter } from '@einfach/core'
import { nextHistoryTransactionId, pushHistoryAtom } from '../history'
import type { HistoryEntry, HistoryRecordResult } from '../history'
import type { ProjectionRevision } from '../backend/types'
import type { ToolbarBackendMutationResult, ToolbarMutationOutcome } from './types'
import {
  TOOLBAR_MUTATION_ACKNOWLEDGEMENT_ERROR,
  TOOLBAR_MUTATION_OUTCOME_UNKNOWN_ERROR,
  activeToolbarMutationTicketAtom,
  toolbarMutationLifecycleBackingAtom,
  toolbarMutationTransportLaneAtom,
} from './mutation-state'
import type { CapturedToolbarMutationStep, ToolbarMutationTicket } from './mutation-state'
import { errorMessage, lifecycleForTicket } from './mutation-lifecycle'
import { isProjectionRevision, rangesEqual } from './mutation-snapshots'

function recordToolbarMutationHistory(
  set: Setter,
  ticket: ToolbarMutationTicket,
  entry: HistoryEntry,
): HistoryRecordResult {
  const append = (nextEntry: HistoryEntry): boolean => set(pushHistoryAtom, nextEntry)
  try {
    const result = ticket.historyEntryRecorder(entry, append)
    return result === 'recorded' || result === 'unavailable' || result === 'rejected'
      ? result
      : 'rejected'
  } catch {
    return 'rejected'
  }
}

function strictAcknowledgementRevision(
  result: unknown,
  ticket: ToolbarMutationTicket,
  step: CapturedToolbarMutationStep,
): ProjectionRevision | null {
  try {
    if (typeof result !== 'object' || result === null) return null
    const acknowledgement = result as Partial<ToolbarBackendMutationResult>
    if (
      acknowledgement.sheetId !== ticket.sheetId ||
      acknowledgement.kind !== step.kind ||
      acknowledgement.requestId !== step.requestId ||
      !rangesEqual(acknowledgement.affectedRange, step.range) ||
      !isProjectionRevision(acknowledgement.revision)
    ) {
      return null
    }
    return acknowledgement.revision
  } catch {
    return null
  }
}

export async function executeMutationTicket(
  get: Getter,
  set: Setter,
  ticket: ToolbarMutationTicket,
): Promise<ToolbarMutationOutcome> {
  if (get(toolbarMutationTransportLaneAtom) !== null) return 'blocked'
  set(toolbarMutationTransportLaneAtom, ticket)
  try {
    let acknowledgedCount = 0
    let acknowledgedRevision: ProjectionRevision | null = null
    set(toolbarMutationLifecycleBackingAtom, lifecycleForTicket('pending', ticket))

    for (const step of ticket.steps) {
      let result: ToolbarBackendMutationResult
      try {
        result = await step.execute()
      } catch (error) {
        if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
        set(
          toolbarMutationLifecycleBackingAtom,
          lifecycleForTicket('outcome-unknown', ticket, {
            acknowledgedRevision,
            acknowledgedCount,
            canRetryRefresh: true,
            error: `${TOOLBAR_MUTATION_OUTCOME_UNKNOWN_ERROR} ${errorMessage(error)}`,
          }),
        )
        return 'outcome-unknown'
      }

      if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
      const revision = strictAcknowledgementRevision(result, ticket, step)
      if (revision === null) {
        set(
          toolbarMutationLifecycleBackingAtom,
          lifecycleForTicket('outcome-unknown', ticket, {
            acknowledgedRevision,
            acknowledgedCount,
            canRetryRefresh: true,
            error: `${TOOLBAR_MUTATION_OUTCOME_UNKNOWN_ERROR} ${TOOLBAR_MUTATION_ACKNOWLEDGEMENT_ERROR}`,
          }),
        )
        return 'outcome-unknown'
      }
      acknowledgedCount += 1
      acknowledgedRevision = revision
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleForTicket('pending', ticket, { acknowledgedRevision, acknowledgedCount }),
      )
    }

    set(
      toolbarMutationLifecycleBackingAtom,
      lifecycleForTicket('local-acknowledged', ticket, {
        acknowledgedRevision,
        acknowledgedCount,
      }),
    )
    const historyRecordResult = recordToolbarMutationHistory(set, ticket, {
      transactionId: nextHistoryTransactionId('toolbar'),
      kind: ticket.historyKind,
      sheetId: ticket.sheetId,
      projectionRevision: acknowledgedRevision as ProjectionRevision,
      affectedRange: ticket.affectedRange,
    })
    if (historyRecordResult === 'rejected') {
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleForTicket('outcome-unknown', ticket, {
          acknowledgedRevision,
          acknowledgedCount,
          canRetryRefresh: true,
          error: `${TOOLBAR_MUTATION_OUTCOME_UNKNOWN_ERROR} History rejected the acknowledged mutation.`,
        }),
      )
      return 'outcome-unknown'
    }

    set(
      toolbarMutationLifecycleBackingAtom,
      lifecycleForTicket('refreshing', ticket, { acknowledgedRevision, acknowledgedCount }),
    )
    try {
      await ticket.refreshProjection(ticket.sheetId)
    } catch (error) {
      if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleForTicket('refresh-failed', ticket, {
          acknowledgedRevision,
          acknowledgedCount,
          canRetryRefresh: true,
          error: `Toolbar mutation was acknowledged, but refresh failed: ${errorMessage(error)}`,
        }),
      )
      return 'refresh-failed'
    }

    if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
    set(activeToolbarMutationTicketAtom, null)
    set(
      toolbarMutationLifecycleBackingAtom,
      lifecycleForTicket('ready', ticket, { acknowledgedRevision, acknowledgedCount }),
    )
    return 'completed'
  } finally {
    if (get(toolbarMutationTransportLaneAtom) === ticket) {
      set(toolbarMutationTransportLaneAtom, null)
    }
  }
}
