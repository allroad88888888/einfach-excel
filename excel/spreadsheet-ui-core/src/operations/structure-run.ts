import type { Getter, Setter } from '@einfach/core'
import { acquireHistoryProducerReservationAtom, nextHistoryTransactionId } from '../history'
import { acknowledgedStructureOperation } from './structure-acknowledgement'
import {
  STRUCTURE_OPERATION_ACKNOWLEDGEMENT_ERROR,
  STRUCTURE_OPERATION_HISTORY_ERROR,
  STRUCTURE_OPERATION_OUTCOME_UNKNOWN_ERROR,
  STRUCTURE_OPERATION_REJECTED_ERROR,
  STRUCTURE_OPERATION_UNSUPPORTED_ERROR,
  type RunStructureOperationInput,
  type StructureOperationCommandOutcome,
} from './structure-contract'
import {
  captureStructureOperationHistoryEntryRecorder,
  recordStructureOperationHistory,
} from './structure-history'
import {
  activeStructureOperationTicketAtom,
  completeStructureOperationTicketAtom,
  structureLifecycleFor,
  structureLifecycleForTicket,
  structureOperationLifecycleBackingAtom,
  structureOperationRequestSequenceAtom,
  structureOperationTicketIsCurrent,
  structureOperationTransportReservationAtom,
  type StructureOperationTicket,
} from './structure-lifecycle'
import {
  buildStructureOperationRequest,
  nextStructureOperationRequestId,
  snapshotStructureOperationIntent,
  structureOperationExecutor,
} from './structure-request'
import {
  normalizeStructureOperationTimeout,
  structureOperationErrorMessage,
  withStructureOperationTimeout,
} from './structure-transport'
import { shiftStructureViewFacts } from './structure-view-shift'

export async function runStructureOperation(
  get: Getter,
  set: Setter,
  input: RunStructureOperationInput,
): Promise<StructureOperationCommandOutcome> {
  if (
    get(activeStructureOperationTicketAtom) !== null ||
    get(structureOperationTransportReservationAtom) !== null
  ) {
    return 'stale'
  }

  const intent = snapshotStructureOperationIntent(input?.intent)
  const historyEntryRecorder =
    input === null || input === undefined
      ? null
      : captureStructureOperationHistoryEntryRecorder(input)
  if (
    intent === null ||
    typeof input?.refreshProjection !== 'function' ||
    historyEntryRecorder === null
  ) {
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleFor('rejected', { error: STRUCTURE_OPERATION_REJECTED_ERROR }),
    )
    return 'rejected'
  }

  const source = input.source
  const execute = source ? structureOperationExecutor(source, intent.kind) : null
  if (execute === null) {
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleFor('unsupported', {
        operation: intent.kind,
        sheetId: intent.sheetId,
        error: STRUCTURE_OPERATION_UNSUPPORTED_ERROR,
      }),
    )
    return 'unsupported'
  }

  const requestId = nextStructureOperationRequestId(get(structureOperationRequestSequenceAtom))
  if (requestId === null) {
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleFor('rejected', {
        operation: intent.kind,
        sheetId: intent.sheetId,
        error: 'Structure operation request identity space is exhausted.',
      }),
    )
    return 'rejected'
  }

  const request = buildStructureOperationRequest(intent, requestId)
  const historyReservation = set(acquireHistoryProducerReservationAtom)
  if (historyReservation === null) {
    return 'stale'
  }
  const transactionId = nextHistoryTransactionId('structure')

  const ticket: StructureOperationTicket = Object.freeze({
    intent,
    request,
    requestId,
    transactionId,
    historyReservation,
    historyEntryRecorder,
  })
  set(structureOperationRequestSequenceAtom, requestId)
  set(activeStructureOperationTicketAtom, ticket)
  set(structureOperationLifecycleBackingAtom, structureLifecycleForTicket('pending', ticket))

  // Publish the immutable reservation before launching transport. Same-tick re-entry is inert.
  await Promise.resolve()
  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
  // Einfach publishes the first async-write flush on a post-await setter.
  set(structureOperationLifecycleBackingAtom, get(structureOperationLifecycleBackingAtom))
  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'

  set(structureOperationTransportReservationAtom, ticket)
  const transport = Promise.resolve().then(() => execute.call(source, ticket.request))
  const releaseTransportReservation = () => {
    if (get(structureOperationTransportReservationAtom) === ticket) {
      set(structureOperationTransportReservationAtom, null)
    }
  }
  void transport.then(releaseTransportReservation, releaseTransportReservation)

  let result: unknown
  try {
    result = await withStructureOperationTimeout(
      transport,
      normalizeStructureOperationTimeout(input.timeoutMs),
      'Structure operation mutation',
    )
  } catch (error) {
    if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleForTicket(
        'outcome-unknown',
        ticket,
        null,
        `${STRUCTURE_OPERATION_OUTCOME_UNKNOWN_ERROR} ` +
          `Backend detail: ${structureOperationErrorMessage(error)}`,
      ),
    )
    return 'outcome-unknown'
  }

  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
  const acknowledgement = acknowledgedStructureOperation(result, ticket)
  if (acknowledgement === null) {
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleForTicket(
        'outcome-unknown',
        ticket,
        null,
        `${STRUCTURE_OPERATION_OUTCOME_UNKNOWN_ERROR} ${STRUCTURE_OPERATION_ACKNOWLEDGEMENT_ERROR}`,
      ),
    )
    return 'outcome-unknown'
  }
  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'

  // W3 structural-shift contract: displaced index space moves UI-core
  // canonical view facts (freeze band, hidden index sets) before anything
  // else reads post-mutation coordinates. The pre/post snapshots become
  // history side payloads: inverting a delete cannot restore hidden index
  // membership, so undo/redo of this backend transaction replays the
  // exact recorded view facts instead (see HistoryEntry.localSidePayloads).
  const sheetId = ticket.intent.sheetId
  const localSidePayloads = shiftStructureViewFacts(
    get,
    set,
    sheetId,
    acknowledgement.structuralShift,
  )

  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
  const historyRecordResult = recordStructureOperationHistory(set, ticket, {
    transactionId: ticket.transactionId,
    kind: ticket.intent.kind,
    sheetId: ticket.intent.sheetId,
    projectionRevision: acknowledgement.revision,
    ...(acknowledgement.affectedRange ? { affectedRange: acknowledgement.affectedRange } : {}),
    ...(localSidePayloads.length > 0 ? { localSidePayloads } : {}),
  })
  if (historyRecordResult === 'rejected') {
    if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleForTicket(
        'outcome-unknown',
        ticket,
        acknowledgement.revision,
        `${STRUCTURE_OPERATION_OUTCOME_UNKNOWN_ERROR} ${STRUCTURE_OPERATION_HISTORY_ERROR}`,
      ),
    )
    return 'outcome-unknown'
  }
  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'

  set(
    structureOperationLifecycleBackingAtom,
    structureLifecycleForTicket('local-acknowledged', ticket, acknowledgement.revision),
  )

  await Promise.resolve()
  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
  set(
    structureOperationLifecycleBackingAtom,
    structureLifecycleForTicket('refreshing', ticket, acknowledgement.revision),
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
        acknowledgement.revision,
        'Structure operation was acknowledged, ' +
          `but refresh failed: ${structureOperationErrorMessage(error)}`,
      ),
    )
    return 'refresh-failed'
  }

  if (!structureOperationTicketIsCurrent(get, ticket)) return 'stale'
  return set(completeStructureOperationTicketAtom, {
    ticket,
    acknowledgedRevision: acknowledgement.revision,
  })
    ? 'completed'
    : 'stale'
}
