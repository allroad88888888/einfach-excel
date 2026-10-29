import { atom } from '@einfach/core'
import type { ToolbarMutationOutcome, RunToolbarMutationInput } from './types'
import {
  INITIAL_TOOLBAR_MUTATION_LIFECYCLE,
  TOOLBAR_MUTATION_CAPABILITY_ERROR,
  activeToolbarMutationTicketAtom,
  toolbarMutationLifecycleAtom,
  toolbarMutationLifecycleBackingAtom,
  toolbarMutationSessionSequenceAtom,
  toolbarMutationTransportLaneAtom,
} from './mutation-state'
import { errorMessage, lifecycleFor, lifecycleForTicket } from './mutation-lifecycle'
import { isCellRange, snapshotRange } from './mutation-snapshots'
import { buildMutationTicket } from './mutation-ticket'
import { executeMutationTicket } from './mutation-execute'

export const runToolbarMutationAtom = atom(
  (get) => get(toolbarMutationLifecycleAtom),
  async (get, set, input: RunToolbarMutationInput): Promise<ToolbarMutationOutcome> => {
    if (
      get(activeToolbarMutationTicketAtom) !== null ||
      get(toolbarMutationTransportLaneAtom) !== null
    ) {
      return 'blocked'
    }
    const ticket = buildMutationTicket(get, set, input)
    if (ticket === null) {
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleFor('blocked', {
          sessionId: get(toolbarMutationSessionSequenceAtom),
          operation: input.operation,
          sheetId: input.sheetId || null,
          affectedRange: isCellRange(input.affectedRange)
            ? snapshotRange(input.affectedRange)
            : null,
          error: TOOLBAR_MUTATION_CAPABILITY_ERROR,
        }),
      )
      return 'blocked'
    }
    set(activeToolbarMutationTicketAtom, ticket)
    return executeMutationTicket(get, set, ticket)
  },
)
runToolbarMutationAtom.debugLabel = 'spreadsheet.toolbar.runMutation'

/**
 * Kept as a compatibility command, but intentionally fails closed. Once a
 * backend promise has been awaited, a rejection cannot prove the mutation was
 * not applied; callers must reconcile with retryToolbarMutationRefreshAtom.
 */
export const retryToolbarMutationAtom = atom(
  (get) => get(toolbarMutationLifecycleAtom),
  async (): Promise<ToolbarMutationOutcome> => 'blocked',
)
retryToolbarMutationAtom.debugLabel = 'spreadsheet.toolbar.retryMutation'

/** Refresh/reconcile only: never resends a mutation after ACK or ambiguous settlement. */
export const retryToolbarMutationRefreshAtom = atom(
  (get) => get(toolbarMutationLifecycleAtom),
  async (get, set): Promise<ToolbarMutationOutcome> => {
    const ticket = get(activeToolbarMutationTicketAtom)
    const lifecycle = get(toolbarMutationLifecycleBackingAtom)
    if (
      ticket === null ||
      get(toolbarMutationTransportLaneAtom) !== null ||
      (lifecycle.status !== 'refresh-failed' && lifecycle.status !== 'outcome-unknown') ||
      !lifecycle.canRetryRefresh ||
      lifecycle.sessionId !== ticket.sessionId
    ) {
      return 'blocked'
    }

    set(toolbarMutationTransportLaneAtom, ticket)
    try {
      const terminalStatus = lifecycle.status
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleForTicket('refreshing', ticket, {
          acknowledgedRevision: lifecycle.acknowledgedRevision,
          acknowledgedCount: lifecycle.acknowledgedCount,
        }),
      )
      try {
        await ticket.refreshProjection(ticket.sheetId)
      } catch (error) {
        if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
        set(
          toolbarMutationLifecycleBackingAtom,
          lifecycleForTicket(terminalStatus, ticket, {
            acknowledgedRevision: lifecycle.acknowledgedRevision,
            acknowledgedCount: lifecycle.acknowledgedCount,
            canRetryRefresh: true,
            error: `Toolbar reconciliation refresh failed: ${errorMessage(error)}`,
          }),
        )
        return terminalStatus === 'refresh-failed' ? 'refresh-failed' : 'outcome-unknown'
      }
      if (get(activeToolbarMutationTicketAtom) !== ticket) return 'stale'
      set(activeToolbarMutationTicketAtom, null)
      if (terminalStatus === 'outcome-unknown') {
        set(
          toolbarMutationLifecycleBackingAtom,
          lifecycleForTicket('outcome-unknown', ticket, {
            acknowledgedRevision: lifecycle.acknowledgedRevision,
            acknowledgedCount: lifecycle.acknowledgedCount,
            canRetryRefresh: false,
            error: 'Projection refreshed, but the toolbar mutation outcome remains unknown.',
          }),
        )
        return 'outcome-unknown'
      }
      set(
        toolbarMutationLifecycleBackingAtom,
        lifecycleForTicket('ready', ticket, {
          acknowledgedRevision: lifecycle.acknowledgedRevision,
          acknowledgedCount: lifecycle.acknowledgedCount,
        }),
      )
      return 'completed'
    } finally {
      if (get(toolbarMutationTransportLaneAtom) === ticket) {
        set(toolbarMutationTransportLaneAtom, null)
      }
    }
  },
)
retryToolbarMutationRefreshAtom.debugLabel = 'spreadsheet.toolbar.retryMutationRefresh'

/**
 * Invalidates the active session without releasing an unsettled transport lane.
 * Late results therefore resolve as stale, and a replacement mutation remains
 * blocked until the raw promise has actually settled. Recovery-bearing
 * refresh-failed/outcome-unknown tickets cannot be reset away; their only legal
 * exit is refresh-only reconciliation.
 */
export const resetToolbarMutationAtom = atom(
  (get) => get(toolbarMutationLifecycleAtom),
  (get, set): boolean => {
    const ticket = get(activeToolbarMutationTicketAtom)
    if (ticket === null) return false
    const lifecycle = get(toolbarMutationLifecycleBackingAtom)
    if (
      (lifecycle.status === 'refresh-failed' || lifecycle.status === 'outcome-unknown') &&
      lifecycle.canRetryRefresh
    ) {
      return false
    }
    set(activeToolbarMutationTicketAtom, null)
    set(toolbarMutationLifecycleBackingAtom, INITIAL_TOOLBAR_MUTATION_LIFECYCLE)
    return true
  },
)
resetToolbarMutationAtom.debugLabel = 'spreadsheet.toolbar.resetMutation'
