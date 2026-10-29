import { atom } from '@einfach/core'
import type { HistoryCommandOutcome, RetryHistoryRefreshInput } from './types'
import { lifecycleFor, lifecycleForTicket } from './backing-state'
import { normalizeTimeout, refreshFailureError, withTimeout } from './transport'
import {
  activeHistoryTicketAtom,
  historyLifecycleBackingAtom,
  historyProjectionRevisionBackingAtom,
  historyStackBackingAtom,
} from './backing-atoms'

export const retryHistoryRefreshAtom = atom(
  null,
  async (get, set, input: RetryHistoryRefreshInput): Promise<HistoryCommandOutcome> => {
    const ticket = get(activeHistoryTicketAtom)
    const lifecycle = get(historyLifecycleBackingAtom)
    if (
      ticket === null ||
      lifecycle.status !== 'refresh-failed' ||
      lifecycle.sessionId !== ticket.sessionId ||
      lifecycle.requestId !== ticket.requestId ||
      lifecycle.acknowledgedRevision === null
    ) {
      return 'blocked'
    }
    const acknowledgedRevision = lifecycle.acknowledgedRevision
    const historyWitness = get(historyStackBackingAtom)
    const projectionRevisionWitness = get(historyProjectionRevisionBackingAtom)
    const ownsRetryWitness = (): boolean =>
      get(activeHistoryTicketAtom) === ticket &&
      get(historyLifecycleBackingAtom) === lifecycle &&
      get(historyStackBackingAtom) === historyWitness &&
      get(historyProjectionRevisionBackingAtom) === projectionRevisionWitness

    let refreshProjection: RetryHistoryRefreshInput['refreshProjection']
    let timeoutMs: number
    try {
      refreshProjection = input.refreshProjection
      if (!ownsRetryWitness()) return 'blocked'
      const timeoutValue = input.timeoutMs
      if (!ownsRetryWitness()) return 'blocked'
      timeoutMs = normalizeTimeout(timeoutValue)
    } catch {
      return 'blocked'
    }
    if (typeof refreshProjection !== 'function' || !ownsRetryWitness()) return 'blocked'

    const attempt = Object.freeze({
      ticket,
      lifecycle,
      acknowledgedRevision,
      historyWitness,
      projectionRevisionWitness,
      refreshProjection,
      timeoutMs,
    })
    set(historyLifecycleBackingAtom, lifecycleForTicket('refreshing', ticket, acknowledgedRevision))
    const ownsAttempt = (): boolean => {
      const currentLifecycle = get(historyLifecycleBackingAtom)
      return (
        get(activeHistoryTicketAtom) === attempt.ticket &&
        get(historyStackBackingAtom) === attempt.historyWitness &&
        get(historyProjectionRevisionBackingAtom) === attempt.projectionRevisionWitness &&
        currentLifecycle.status === 'refreshing' &&
        currentLifecycle.sessionId === attempt.ticket.sessionId &&
        currentLifecycle.requestId === attempt.ticket.requestId &&
        currentLifecycle.acknowledgedRevision === attempt.acknowledgedRevision
      )
    }
    if (!ownsAttempt()) return 'blocked'
    try {
      await withTimeout(
        Promise.resolve().then(attempt.refreshProjection),
        attempt.timeoutMs,
        'History refresh',
      )
    } catch (error) {
      if (!ownsAttempt()) return 'blocked'
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
    if (!ownsAttempt()) return 'blocked'
    set(historyLifecycleBackingAtom, lifecycleFor('ready', { sessionId: ticket.sessionId }))
    if (get(activeHistoryTicketAtom) !== ticket) return 'blocked'
    // Final projection/lifecycle is committed before the exact ticket is
    // cleared. No write from this retry occurs after replacement can start.
    set(activeHistoryTicketAtom, null)
    return 'completed'
  },
)
retryHistoryRefreshAtom.debugLabel = 'spreadsheet.history.retryRefresh'
