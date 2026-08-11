import { atom, type Setter } from '@einfach/core'
import { OPERATION_RESULT_UNCONFIRMED } from './constants'
import { freezeAttempt, freezeLedger } from './mutation-domain'
import { managerCloseWitnessForMutation } from './name-manager-lifecycle'
import { copyMutationResult } from './result-snapshots'
import { scheduleCapturedRegistryRead } from './registry'
import {
  activeNamedRangeMutationTicketAtom,
  lateNamedRangeSettlementAtom,
  namedRangeCapabilityStateSourceAtom,
  namedRangeMutationStateSourceAtom,
  namedRangeOperationAttemptLedgerSourceAtom,
} from './state'
import type { NamedRangeMutationTicket, TerminalMutationSettlement } from './internal-types'
import type {
  NamedRangeControllerPort,
  NamedRangeMutationOutcome,
  NamedRangeMutationResult,
  NamedRangeOperationAttempt,
  NamedRangeOperationAttemptStatus,
  SettleNamedRangeMutationInput,
} from './types'

type ListNamedRangesMethod = NonNullable<NamedRangeControllerPort['listNamedRanges']>

function replaceAttemptStatus(
  attempts: readonly NamedRangeOperationAttempt[],
  ticket: NamedRangeMutationTicket,
  status: Exclude<NamedRangeOperationAttemptStatus, 'pending'>,
  error: string | null,
  revision?: number | string,
): readonly NamedRangeOperationAttempt[] {
  let changed = false
  const next = attempts.map((attempt) => {
    if (attempt.operationId !== ticket.operationId) return attempt
    changed = true
    const snapshot = { ...attempt }
    delete snapshot.revision
    return freezeAttempt(
      revision === undefined
        ? { ...snapshot, status, error }
        : { ...snapshot, status, revision, error },
    )
  })
  return changed ? freezeLedger(next) : attempts
}

export const markNamedRangeMutationUnknownAtom = atom(
  null,
  (get, set, ticket: NamedRangeMutationTicket): void => {
    if (get(activeNamedRangeMutationTicketAtom) !== ticket) return
    set(
      namedRangeOperationAttemptLedgerSourceAtom,
      replaceAttemptStatus(
        get(namedRangeOperationAttemptLedgerSourceAtom),
        ticket,
        'outcome-unknown',
        OPERATION_RESULT_UNCONFIRMED,
      ),
    )
    set(
      namedRangeMutationStateSourceAtom,
      Object.freeze({
        status: 'outcome-unknown',
        operationId: ticket.operationId,
        requestId: ticket.requestId,
        origin: ticket.origin,
        sessionId: ticket.sessionId,
        action: ticket.action,
        outcome: null,
        error: OPERATION_RESULT_UNCONFIRMED,
      }),
    )
  },
)

export const settleNamedRangeMutationResultAtom = atom(
  null,
  (
    get,
    set,
    input: { readonly ticket: NamedRangeMutationTicket; readonly result: NamedRangeMutationResult },
  ): NamedRangeMutationOutcome | null => {
    if (get(activeNamedRangeMutationTicketAtom) !== input.ticket) return null
    const result = copyMutationResult(input.result)
    if (result === null || result.requestId !== input.ticket.requestId) {
      set(markNamedRangeMutationUnknownAtom, input.ticket)
      return null
    }
    const outcome = result.outcome!
    const status: NamedRangeOperationAttemptStatus =
      outcome === 'w0-acknowledged' ? 'acknowledged' : 'confirmed-not-applied'
    set(
      namedRangeOperationAttemptLedgerSourceAtom,
      replaceAttemptStatus(
        get(namedRangeOperationAttemptLedgerSourceAtom),
        input.ticket,
        status,
        null,
        result.revision,
      ),
    )
    set(activeNamedRangeMutationTicketAtom, null)
    set(
      namedRangeMutationStateSourceAtom,
      Object.freeze({
        status,
        operationId: input.ticket.operationId,
        requestId: input.ticket.requestId,
        origin: input.ticket.origin,
        sessionId: input.ticket.sessionId,
        action: input.ticket.action,
        outcome,
        error: null,
      }),
    )
    return outcome
  },
)

export const namedRangeMutationGenerationIsCurrentAtom = atom(
  null,
  (get, _set, ticket: NamedRangeMutationTicket): boolean => {
    const capability = get(namedRangeCapabilityStateSourceAtom)
    return capability.status === 'ready' && capability.requestId === ticket.capabilityRequestId
  },
)

const reserveLateNamedRangeSettlementAtom = atom(
  null,
  (get, set, result: NamedRangeMutationResult): TerminalMutationSettlement | null => {
    if (get(lateNamedRangeSettlementAtom) !== null) return null
    const ticket = get(activeNamedRangeMutationTicketAtom)
    const state = get(namedRangeMutationStateSourceAtom)
    if (
      ticket === null ||
      state.status !== 'outcome-unknown' ||
      state.requestId !== ticket.requestId
    )
      return null
    const snapshot = copyMutationResult(result)
    if (snapshot === null || snapshot.requestId !== ticket.requestId) return null
    const base = { ticket, outcome: snapshot.outcome! }
    const settlement: TerminalMutationSettlement = Object.freeze(
      snapshot.revision === undefined ? base : { ...base, revision: snapshot.revision },
    )
    set(lateNamedRangeSettlementAtom, settlement)
    return settlement
  },
)

const applyLateNamedRangeSettlementAtom = atom(
  null,
  (get, set, settlement: TerminalMutationSettlement): NamedRangeMutationOutcome | null => {
    if (get(lateNamedRangeSettlementAtom) !== settlement) return null
    set(lateNamedRangeSettlementAtom, null)
    return set(settleNamedRangeMutationResultAtom, {
      ticket: settlement.ticket,
      result:
        settlement.revision === undefined
          ? { requestId: settlement.ticket.requestId, outcome: settlement.outcome }
          : {
              requestId: settlement.ticket.requestId,
              outcome: settlement.outcome,
              revision: settlement.revision,
            },
    })
  },
)

function executeLateNamedRangeSettlement(
  set: Setter,
  settlement: TerminalMutationSettlement,
  receiver: NamedRangeControllerPort,
  list: ListNamedRangesMethod | undefined,
): void {
  const outcome = set(applyLateNamedRangeSettlementAtom, settlement)
  if (
    outcome === 'w0-acknowledged' &&
    set(namedRangeMutationGenerationIsCurrentAtom, settlement.ticket)
  ) {
    scheduleCapturedRegistryRead(
      set,
      receiver,
      list,
      managerCloseWitnessForMutation(settlement.ticket),
    )
  }
}

export const settleNamedRangeMutationAtom = atom(
  null,
  (_get, set, input: SettleNamedRangeMutationInput): void => {
    const method = input.source.listNamedRanges
    const settlement = set(reserveLateNamedRangeSettlementAtom, input.result)
    if (settlement !== null)
      void Promise.resolve().then(() =>
        executeLateNamedRangeSettlement(
          set,
          settlement,
          input.source,
          typeof method === 'function' ? method : undefined,
        ),
      )
  },
)
settleNamedRangeMutationAtom.debugLabel = 'spreadsheet.namedRanges.settleMutation'
