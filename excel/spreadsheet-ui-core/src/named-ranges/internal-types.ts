import type {
  DeleteNamedRangeRequest,
  NamedRangeBindingKind,
  NamedRangeMutationOutcome,
  NamedRangeMutationPayload,
  NamedRangeScope,
  RunNamedRangeMutationInput,
  SetNamedRangeRequest,
} from './types'

export interface CapabilityTicket {
  readonly requestId: number
}

export interface ManagerCloseWitness {
  readonly sessionId: number
  readonly draftGeneration: number
}

export interface RegistryReadTicket {
  readonly requestId: number
  readonly capabilityRequestId: number
  readonly managerCloseWitness?: ManagerCloseWitness
}

export interface RegistryReadReservationInput {
  readonly methodAvailable: boolean
  readonly managerCloseWitness?: ManagerCloseWitness
}

export interface NamedRangeMutationTicket {
  readonly operationId: string
  readonly requestId: number
  readonly capabilityRequestId: number
  readonly origin: RunNamedRangeMutationInput['origin']
  readonly sessionId: number
  readonly managerDraftGeneration: number | null
  readonly action: NamedRangeMutationPayload['action']
  readonly name: string
  readonly scope: NamedRangeScope
  readonly bindingKind?: NamedRangeBindingKind
  readonly request: Readonly<SetNamedRangeRequest | DeleteNamedRangeRequest>
}

export interface MutationReservationInput {
  readonly origin: RunNamedRangeMutationInput['origin']
  readonly sessionId: number
  readonly managerDraftGeneration: number | null
  readonly mutation: NamedRangeMutationPayload
  readonly mutationMethodAvailable: boolean
  readonly listMethodAvailable: boolean
}

export interface TerminalMutationSettlement {
  readonly ticket: NamedRangeMutationTicket
  readonly outcome: NamedRangeMutationOutcome
  readonly revision?: number | string
}
