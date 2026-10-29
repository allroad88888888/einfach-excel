import type { ProjectionRequestId, ProjectionRevision } from '../backend/types'
import type {
  HistoryAction,
  HistoryEntry,
  HistoryLifecycleState,
  HistoryMutationResult,
  HistoryRedoRequest,
  HistoryUndoRequest,
} from './types'

export interface HistoryStackBackingState {
  readonly entries: readonly HistoryEntry[]
  readonly cursor: number
}

export interface HistoryMutationTicket {
  readonly sessionId: number
  readonly action: HistoryAction
  readonly transactionId: string
  readonly requestId: ProjectionRequestId
  readonly revision: ProjectionRevision
  readonly cursorBefore: number
  readonly cursorAfter: number
  /** Opaque identity proving that the bounded stack did not drift before ACK. */
  readonly historyWitness: HistoryStackBackingState
  readonly entry: HistoryEntry
  readonly request: HistoryUndoRequest | HistoryRedoRequest
  readonly source: object
  readonly execute: (
    request: HistoryUndoRequest | HistoryRedoRequest,
  ) => Promise<HistoryMutationResult>
  readonly refreshProjection: () => Promise<void>
  readonly timeoutMs: number
}

const EMPTY_HISTORY_ENTRIES: readonly HistoryEntry[] = Object.freeze([])

export const INITIAL_HISTORY_STACK: HistoryStackBackingState = Object.freeze({
  entries: EMPTY_HISTORY_ENTRIES,
  cursor: 0,
})

export const INITIAL_HISTORY_LIFECYCLE: HistoryLifecycleState = Object.freeze({
  status: 'ready',
  sessionId: 0,
  action: null,
  transactionId: null,
  requestId: null,
  revision: null,
  acknowledgedRevision: null,
  error: '',
})

export function stackState(
  entries: readonly HistoryEntry[],
  cursor: number,
): HistoryStackBackingState {
  return Object.freeze({ entries: Object.freeze([...entries]), cursor })
}

export function lifecycleFor(
  status: HistoryLifecycleState['status'],
  input: {
    readonly sessionId?: number
    readonly action?: HistoryAction | null
    readonly transactionId?: string | null
    readonly requestId?: ProjectionRequestId | null
    readonly revision?: ProjectionRevision | null
    readonly acknowledgedRevision?: ProjectionRevision | null
    readonly error?: string
  } = {},
): HistoryLifecycleState {
  return Object.freeze({
    status,
    sessionId: input.sessionId ?? 0,
    action: input.action ?? null,
    transactionId: input.transactionId ?? null,
    requestId: input.requestId ?? null,
    revision: input.revision ?? null,
    acknowledgedRevision: input.acknowledgedRevision ?? null,
    error: input.error ?? '',
  })
}

export function lifecycleForTicket(
  status: HistoryLifecycleState['status'],
  ticket: HistoryMutationTicket,
  acknowledgedRevision: ProjectionRevision | null = null,
  error = '',
): HistoryLifecycleState {
  return lifecycleFor(status, {
    sessionId: ticket.sessionId,
    action: ticket.action,
    transactionId: ticket.transactionId,
    requestId: ticket.requestId,
    revision: ticket.revision,
    acknowledgedRevision,
    error,
  })
}

export function isTransportBusy(status: HistoryLifecycleState['status']): boolean {
  return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing'
}
