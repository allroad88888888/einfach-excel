import { atom } from '@einfach/core'
import {
  INITIAL_CAPABILITY_STATE,
  INITIAL_MUTATION_STATE,
  INITIAL_REGISTRY_STATE,
  NAMED_RANGE_MUTATION_LEDGER_MAX,
} from './constants'
import { findOldestTerminal } from './mutation-domain'
import type {
  NamedRangeCapabilityState,
  NamedRangeMutationState,
  NamedRangeOperationAttempt,
  NamedRangeRegistryState,
} from './types'
import type { NamedRangeMutationTicket, TerminalMutationSettlement } from './internal-types'

export const namedRangeCapabilityStateSourceAtom =
  atom<NamedRangeCapabilityState>(INITIAL_CAPABILITY_STATE)
export const namedRangeCapabilitySequenceAtom = atom<number>(0)
export const namedRangeRequestSequenceAtom = atom<number>(0)
export const namedRangeRegistryStateSourceAtom =
  atom<NamedRangeRegistryState>(INITIAL_REGISTRY_STATE)
export const namedRangeMutationStateSourceAtom =
  atom<NamedRangeMutationState>(INITIAL_MUTATION_STATE)
export const namedRangeOperationAttemptLedgerSourceAtom = atom<
  readonly NamedRangeOperationAttempt[]
>(Object.freeze([]))
export const activeNamedRangeMutationTicketAtom = atom<NamedRangeMutationTicket | null>(null)
export const lateNamedRangeSettlementAtom = atom<TerminalMutationSettlement | null>(null)

namedRangeCapabilityStateSourceAtom.debugLabel = 'spreadsheet.namedRanges.capabilitySource'
namedRangeCapabilitySequenceAtom.debugLabel = 'spreadsheet.namedRanges.capabilitySequence'
namedRangeRequestSequenceAtom.debugLabel = 'spreadsheet.namedRanges.requestSequence'
namedRangeRegistryStateSourceAtom.debugLabel = 'spreadsheet.namedRanges.registrySource'
namedRangeMutationStateSourceAtom.debugLabel = 'spreadsheet.namedRanges.mutationSource'
namedRangeOperationAttemptLedgerSourceAtom.debugLabel =
  'spreadsheet.namedRanges.operationAttemptLedgerSource'
activeNamedRangeMutationTicketAtom.debugLabel = 'spreadsheet.namedRanges.activeMutationTicket'
lateNamedRangeSettlementAtom.debugLabel = 'spreadsheet.namedRanges.lateSettlement'

export const namedRangeCapabilitiesAtom = atom((get) => get(namedRangeCapabilityStateSourceAtom))
export const namedRangeRegistryStateAtom = atom((get) => get(namedRangeRegistryStateSourceAtom))
export const namedRangeMutationStateAtom = atom((get) => get(namedRangeMutationStateSourceAtom))
export const namedRangeOperationAttemptLedgerAtom = atom((get) =>
  get(namedRangeOperationAttemptLedgerSourceAtom),
)
export const namedRangeMutationPendingAtom = atom(
  (get): boolean =>
    get(activeNamedRangeMutationTicketAtom) !== null &&
    get(namedRangeMutationStateSourceAtom).status === 'pending',
)
export const namedRangeMutationBlockedAtom = atom((get): boolean => {
  if (get(namedRangeCapabilityStateSourceAtom).status !== 'ready') return true
  const registryStatus = get(namedRangeRegistryStateSourceAtom).status
  if (registryStatus === 'refreshing' || registryStatus === 'projection-unknown') return true
  if (get(activeNamedRangeMutationTicketAtom) !== null) return true
  const ledger = get(namedRangeOperationAttemptLedgerSourceAtom)
  return (
    ledger.some(
      (attempt) => attempt.status === 'pending' || attempt.status === 'outcome-unknown',
    ) ||
    (ledger.length >= NAMED_RANGE_MUTATION_LEDGER_MAX && findOldestTerminal(ledger) < 0)
  )
})

namedRangeCapabilitiesAtom.debugLabel = 'spreadsheet.namedRanges.capabilities'
namedRangeRegistryStateAtom.debugLabel = 'spreadsheet.namedRanges.registryState'
namedRangeMutationStateAtom.debugLabel = 'spreadsheet.namedRanges.mutationState'
namedRangeOperationAttemptLedgerAtom.debugLabel = 'spreadsheet.namedRanges.operationAttemptLedger'
namedRangeMutationPendingAtom.debugLabel = 'spreadsheet.namedRanges.mutationPending'
namedRangeMutationBlockedAtom.debugLabel = 'spreadsheet.namedRanges.mutationBlocked'
