import type { ProjectionRequestId } from '../backend/types'
import type {
  FilterSortEntrypoint,
  FilterSortEntrypointState,
  FilterSortEntrypointTarget,
  FilterSortLifecycleState,
  SortDirection,
} from './types'
import type { FilterSortEntrypointTicket } from './internal-types'

function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export const nextFilterSortSessionId = nextSafeMonotonicIdentity
export const nextFilterSortRequestId = nextSafeMonotonicIdentity
export const nextFilterSortOperationId = nextSafeMonotonicIdentity

export const INITIAL_FILTER_SORT_LIFECYCLE: FilterSortLifecycleState = Object.freeze({
  status: 'closed',
  sessionId: 0,
  requestId: null,
  sheetId: null,
  colIndex: null,
})

export const lifecycleFor = (
  status: FilterSortLifecycleState['status'],
  sessionId: number,
  sheetId: string | null,
  colIndex: number | null,
  requestId: ProjectionRequestId | null = null,
): FilterSortLifecycleState => Object.freeze({ status, sessionId, requestId, sheetId, colIndex })

export const INITIAL_FILTER_SORT_ENTRYPOINT_STATE: FilterSortEntrypointState = Object.freeze({
  status: 'idle',
  operationId: null,
  requestId: null,
  entrypoint: null,
  target: null,
  direction: null,
  attempt: 0,
  error: '',
})

export function entrypointStateFor(
  status: FilterSortEntrypointState['status'],
  input: {
    readonly operationId?: number | null
    readonly requestId?: ProjectionRequestId | null
    readonly entrypoint?: FilterSortEntrypoint | null
    readonly target?: FilterSortEntrypointTarget | null
    readonly direction?: SortDirection | null
    readonly attempt?: number
    readonly error?: string
  } = {},
): FilterSortEntrypointState {
  return Object.freeze({
    status,
    operationId: input.operationId ?? null,
    requestId: input.requestId ?? null,
    entrypoint: input.entrypoint ?? null,
    target: input.target ?? null,
    direction: input.direction ?? null,
    attempt: input.attempt ?? 0,
    error: input.error ?? '',
  })
}

export const entrypointStateForTicket = (
  status: FilterSortEntrypointState['status'],
  ticket: FilterSortEntrypointTicket,
  error = '',
): FilterSortEntrypointState =>
  entrypointStateFor(status, {
    operationId: ticket.operationId,
    requestId: ticket.requestId,
    entrypoint: ticket.entrypoint,
    target: ticket.target,
    direction: ticket.direction,
    attempt: ticket.attempt,
    error,
  })

export function nextEntrypointAttempt(
  previous: FilterSortEntrypointState,
  entrypoint: FilterSortEntrypoint,
  target: FilterSortEntrypointTarget,
  direction: SortDirection | null,
): number {
  return (previous.status === 'error' ||
    previous.status === 'blocked' ||
    previous.status === 'stale') &&
    previous.entrypoint === entrypoint &&
    previous.direction === direction &&
    previous.target?.sheetId === target.sheetId &&
    previous.target?.colIndex === target.colIndex
    ? previous.attempt < Number.MAX_SAFE_INTEGER
      ? previous.attempt + 1
      : previous.attempt
    : 1
}
