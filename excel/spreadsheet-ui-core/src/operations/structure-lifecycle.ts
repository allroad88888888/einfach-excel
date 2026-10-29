import { atom } from '@einfach/core'
import type { Atom, Getter } from '@einfach/core'
import type { ProjectionRequestId, ProjectionRevision } from '../backend/types'
import { releaseHistoryProducerReservationAtom } from '../history'
import type { HistoryEntryRecorder, HistoryProducerReservation } from '../history'
import type {
  StructureOperationIntent,
  StructureOperationLifecycleState,
  StructureOperationLifecycleStatus,
  StructureOperationRequest,
} from './structure-contract'

export interface StructureOperationTicket {
  readonly intent: StructureOperationIntent
  readonly request: StructureOperationRequest
  readonly requestId: ProjectionRequestId
  readonly transactionId: string
  readonly historyReservation: HistoryProducerReservation
  readonly historyEntryRecorder: HistoryEntryRecorder
}

export const INITIAL_STRUCTURE_OPERATION_LIFECYCLE: StructureOperationLifecycleState =
  Object.freeze({
    status: 'idle',
    operation: null,
    sheetId: null,
    transactionId: null,
    requestId: null,
    acknowledgedRevision: null,
    error: '',
  })

export function structureLifecycleFor(
  status: StructureOperationLifecycleStatus,
  input: {
    readonly operation?: StructureOperationIntent['kind'] | null
    readonly sheetId?: string | null
    readonly transactionId?: string | null
    readonly requestId?: ProjectionRequestId | null
    readonly acknowledgedRevision?: ProjectionRevision | null
    readonly error?: string
  } = {},
): StructureOperationLifecycleState {
  return Object.freeze({
    status,
    operation: input.operation ?? null,
    sheetId: input.sheetId ?? null,
    transactionId: input.transactionId ?? null,
    requestId: input.requestId ?? null,
    acknowledgedRevision: input.acknowledgedRevision ?? null,
    error: input.error ?? '',
  })
}

export function structureLifecycleForTicket(
  status: StructureOperationLifecycleStatus,
  ticket: StructureOperationTicket,
  acknowledgedRevision: ProjectionRevision | null = null,
  error = '',
): StructureOperationLifecycleState {
  return structureLifecycleFor(status, {
    operation: ticket.intent.kind,
    sheetId: ticket.intent.sheetId,
    transactionId: ticket.transactionId,
    requestId: ticket.requestId,
    acknowledgedRevision,
    error,
  })
}

export const structureOperationLifecycleBackingAtom = atom<StructureOperationLifecycleState>(
  INITIAL_STRUCTURE_OPERATION_LIFECYCLE,
)
structureOperationLifecycleBackingAtom.debugLabel =
  'spreadsheet.operations.structure.lifecycleBacking'

export const activeStructureOperationTicketAtom = atom<StructureOperationTicket | null>(null)
activeStructureOperationTicketAtom.debugLabel = 'spreadsheet.operations.structure.activeTicket'

export const structureOperationTransportReservationAtom = atom<StructureOperationTicket | null>(
  null,
)
structureOperationTransportReservationAtom.debugLabel =
  'spreadsheet.operations.structure.transportReservation'

export const structureOperationRequestSequenceAtom = atom<ProjectionRequestId>(0)
structureOperationRequestSequenceAtom.debugLabel =
  'spreadsheet.operations.structure.requestSequence'

/** Read-only lifecycle projection. The pending ticket remains Core-private. */
export const structureOperationLifecycleAtom: Atom<StructureOperationLifecycleState> = atom((get) =>
  get(structureOperationLifecycleBackingAtom),
)
structureOperationLifecycleAtom.debugLabel = 'spreadsheet.operations.structure.lifecycle'

export const structureOperationInFlightAtom = atom((get) => {
  const status = get(structureOperationLifecycleBackingAtom).status
  return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing'
})
structureOperationInFlightAtom.debugLabel = 'spreadsheet.operations.structure.inFlight'

export const structureOperationCanRetryRefreshAtom = atom((get) => {
  const ticket = get(activeStructureOperationTicketAtom)
  const lifecycle = get(structureOperationLifecycleBackingAtom)
  return (
    ticket !== null &&
    lifecycle.status === 'refresh-failed' &&
    lifecycle.operation === ticket.intent.kind &&
    lifecycle.sheetId === ticket.intent.sheetId &&
    lifecycle.transactionId === ticket.transactionId &&
    lifecycle.requestId === ticket.requestId &&
    lifecycle.acknowledgedRevision !== null
  )
})
structureOperationCanRetryRefreshAtom.debugLabel =
  'spreadsheet.operations.structure.canRetryRefresh'

export function structureOperationTicketIsCurrent(
  get: Getter,
  ticket: StructureOperationTicket,
): boolean {
  const lifecycle = get(structureOperationLifecycleBackingAtom)
  return (
    get(activeStructureOperationTicketAtom) === ticket &&
    lifecycle.operation === ticket.intent.kind &&
    lifecycle.sheetId === ticket.intent.sheetId &&
    lifecycle.transactionId === ticket.transactionId &&
    lifecycle.requestId === ticket.requestId
  )
}

export const completeStructureOperationTicketAtom = atom(
  null,
  (
    get,
    set,
    input: {
      readonly ticket: StructureOperationTicket
      readonly acknowledgedRevision: ProjectionRevision
    },
  ): boolean => {
    const { ticket, acknowledgedRevision } = input
    if (!structureOperationTicketIsCurrent(get, ticket)) return false
    if (!set(releaseHistoryProducerReservationAtom, ticket.historyReservation)) return false
    set(activeStructureOperationTicketAtom, null)
    set(
      structureOperationLifecycleBackingAtom,
      structureLifecycleForTicket('completed', ticket, acknowledgedRevision),
    )
    return true
  },
)
completeStructureOperationTicketAtom.debugLabel = 'spreadsheet.operations.structure.completeTicket'
