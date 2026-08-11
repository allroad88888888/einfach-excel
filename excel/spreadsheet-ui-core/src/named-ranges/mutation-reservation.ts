import { atom } from '@einfach/core'
import { OPERATION_RESULT_UNCONFIRMED, REGISTRY_RESULT_UNCONFIRMED } from './constants'
import {
  blockedMutationState,
  copyMutation,
  freezeAttempt,
  freezeLedger,
  reserveAttemptSlot,
  supportsMutation,
} from './mutation-domain'
import { nextSequence } from './primitives'
import {
  activeNamedRangeMutationTicketAtom,
  namedRangeCapabilityStateSourceAtom,
  namedRangeMutationStateSourceAtom,
  namedRangeOperationAttemptLedgerSourceAtom,
  namedRangeRegistryStateSourceAtom,
  namedRangeRequestSequenceAtom,
} from './state'
import type { MutationReservationInput, NamedRangeMutationTicket } from './internal-types'

export const reserveNamedRangeMutationAtom = atom(
  null,
  (get, set, input: MutationReservationInput): NamedRangeMutationTicket | null => {
    if (get(activeNamedRangeMutationTicketAtom) !== null) return null
    const ledger = get(namedRangeOperationAttemptLedgerSourceAtom)
    if (
      ledger.some((attempt) => attempt.status === 'pending' || attempt.status === 'outcome-unknown')
    )
      return null
    const capability = get(namedRangeCapabilityStateSourceAtom)
    if (
      capability.status !== 'ready' ||
      capability.capabilities === null ||
      capability.requestId === null
    ) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('名称能力不可用'))
      return null
    }
    const registryStatus = get(namedRangeRegistryStateSourceAtom).status
    if (registryStatus === 'refreshing' || registryStatus === 'projection-unknown') {
      set(
        namedRangeMutationStateSourceAtom,
        blockedMutationState(
          registryStatus === 'refreshing' ? '名称列表正在刷新' : REGISTRY_RESULT_UNCONFIRMED,
        ),
      )
      return null
    }
    if (!input.mutationMethodAvailable || !input.listMethodAvailable) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('当前名称操作不可用'))
      return null
    }
    if (!supportsMutation(capability.capabilities, input.mutation)) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('当前名称操作不受支持'))
      return null
    }
    const reservedLedger = reserveAttemptSlot(ledger)
    if (reservedLedger === null) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('名称操作记录已满'))
      return null
    }
    const requestId = nextSequence(get(namedRangeRequestSequenceAtom))
    if (requestId === null || ledger.some((attempt) => attempt.requestId === requestId)) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState(OPERATION_RESULT_UNCONFIRMED))
      return null
    }
    const mutation = copyMutation(input.mutation, requestId)
    if (mutation === null) {
      set(namedRangeMutationStateSourceAtom, blockedMutationState('名称或引用无效'))
      return null
    }
    const operationId = `named-range-${requestId}`
    const ticket: NamedRangeMutationTicket = Object.freeze({
      operationId,
      requestId,
      capabilityRequestId: capability.requestId,
      origin: input.origin,
      sessionId: input.sessionId,
      managerDraftGeneration: input.managerDraftGeneration,
      action: input.mutation.action,
      name: mutation.name,
      scope: mutation.scope,
      bindingKind: mutation.bindingKind,
      request: mutation.request,
    })
    set(namedRangeRequestSequenceAtom, requestId)
    set(
      namedRangeOperationAttemptLedgerSourceAtom,
      freezeLedger([
        ...reservedLedger,
        freezeAttempt({
          operationId,
          requestId,
          origin: input.origin,
          sessionId: input.sessionId,
          action: input.mutation.action,
          name: mutation.name,
          scope: mutation.scope,
          bindingKind: mutation.bindingKind,
          status: 'pending',
          error: null,
        }),
      ]),
    )
    set(activeNamedRangeMutationTicketAtom, ticket)
    set(
      namedRangeMutationStateSourceAtom,
      Object.freeze({
        status: 'pending',
        operationId,
        requestId,
        origin: input.origin,
        sessionId: input.sessionId,
        action: input.mutation.action,
        outcome: null,
        error: null,
      }),
    )
    return ticket
  },
)

export const guardNamedRangeMutationTransportAtom = atom(
  null,
  (get, set, ticket: NamedRangeMutationTicket): boolean => {
    if (get(activeNamedRangeMutationTicketAtom) !== ticket) return false
    if (
      !get(namedRangeOperationAttemptLedgerSourceAtom).some(
        (attempt) => attempt.operationId === ticket.operationId && attempt.status === 'pending',
      )
    )
      return false
    const capability = get(namedRangeCapabilityStateSourceAtom)
    if (capability.status === 'ready' && capability.requestId === ticket.capabilityRequestId)
      return true
    const error = '工作簿上下文已变化'
    set(
      namedRangeOperationAttemptLedgerSourceAtom,
      freezeLedger(
        get(namedRangeOperationAttemptLedgerSourceAtom).map((attempt) =>
          attempt.operationId !== ticket.operationId
            ? attempt
            : freezeAttempt({ ...attempt, status: 'confirmed-not-applied', error }),
        ),
      ),
    )
    set(activeNamedRangeMutationTicketAtom, null)
    set(
      namedRangeMutationStateSourceAtom,
      Object.freeze({
        status: 'confirmed-not-applied',
        operationId: ticket.operationId,
        requestId: ticket.requestId,
        origin: ticket.origin,
        sessionId: ticket.sessionId,
        action: ticket.action,
        outcome: 'confirmed-not-applied',
        error,
      }),
    )
    return false
  },
)
