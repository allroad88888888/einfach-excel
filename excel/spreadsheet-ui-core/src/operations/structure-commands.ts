import { atom } from '@einfach/core'
import { releaseHistoryProducerReservationAtom } from '../history'
import type {
  RetryStructureOperationRefreshInput,
  RunStructureOperationInput,
  StructureOperationCommandOutcome,
} from './structure-contract'
import {
  activeStructureOperationTicketAtom,
  completeStructureOperationTicketAtom,
  INITIAL_STRUCTURE_OPERATION_LIFECYCLE,
  structureLifecycleForTicket,
  structureOperationLifecycleBackingAtom,
  structureOperationTicketIsCurrent,
  structureOperationTransportReservationAtom,
} from './structure-lifecycle'
import { runStructureOperation } from './structure-run'
import {
  normalizeStructureOperationTimeout,
  structureOperationErrorMessage,
  withStructureOperationTimeout,
} from './structure-transport'

export const runStructureOperationAtom = atom(
  null,
  (get, set, input: RunStructureOperationInput): Promise<StructureOperationCommandOutcome> =>
    runStructureOperation(get, set, input),
)
runStructureOperationAtom.debugLabel = 'spreadsheet.operations.structure.run'

export const retryStructureOperationRefreshAtom = atom(
  null,
  async (
    get,
    set,
    input: RetryStructureOperationRefreshInput,
  ): Promise<StructureOperationCommandOutcome> => {
    if (typeof input?.refreshProjection !== 'function') return 'rejected'
    const ticket = get(activeStructureOperationTicketAtom)
    const lifecycle = get(structureOperationLifecycleBackingAtom)
    if (
      ticket === null ||
      lifecycle.status !== 'refresh-failed' ||
      lifecycle.operation !== ticket.intent.kind ||
      lifecycle.sheetId !== ticket.intent.sheetId ||
      lifecycle.transactionId !== ticket.transactionId ||
      lifecycle.requestId !== ticket.requestId ||
      lifecycle.acknowledgedRevision === null
    ) {
      return 'stale'
    }

    const acknowledgedRevision = lifecycle.acknowledgedRevision
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleForTicket('refreshing', ticket, acknowledgedRevision),
    )
    try {
      await withStructureOperationTimeout(
        Promise.resolve().then(() => input.refreshProjection(ticket.intent.sheetId)),
        normalizeStructureOperationTimeout(input.timeoutMs),
        'Structure operation refresh',
      )
    } catch (error) {
      if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
      set(
        structureOperationLifecycleBackingAtom,
        structureLifecycleForTicket(
          'refresh-failed',
          ticket,
          acknowledgedRevision,
          'Structure operation was acknowledged, ' +
            `but refresh failed: ${structureOperationErrorMessage(error)}`,
        ),
      )
      return 'refresh-failed'
    }

    if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
    return set(completeStructureOperationTicketAtom, {
      ticket,
      acknowledgedRevision,
    })
      ? 'completed'
      : 'stale'
  },
)
retryStructureOperationRefreshAtom.debugLabel = 'spreadsheet.operations.structure.retryRefresh'

/** Invalidate the current ticket after an explicit host reconcile/reset. */
export const resetStructureOperationLifecycleAtom = atom(null, (get, set): boolean => {
  const ticket = get(activeStructureOperationTicketAtom)
  if (ticket === null) {
    if (get(structureOperationTransportReservationAtom) !== null) return false
    set(structureOperationLifecycleBackingAtom, INITIAL_STRUCTURE_OPERATION_LIFECYCLE)
    return false
  }
  if (get(structureOperationTransportReservationAtom) !== null) return false
  const acknowledgedRevision = get(structureOperationLifecycleBackingAtom).acknowledgedRevision
  if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) return false
  set(activeStructureOperationTicketAtom, null)
  set(
    structureOperationLifecycleBackingAtom,
    structureLifecycleForTicket(
      'stale',
      ticket,
      acknowledgedRevision,
      'Structure operation ticket was invalidated by an explicit host reconcile/reset.',
    ),
  )
  return true
})
resetStructureOperationLifecycleAtom.debugLabel = 'spreadsheet.operations.structure.resetLifecycle'
