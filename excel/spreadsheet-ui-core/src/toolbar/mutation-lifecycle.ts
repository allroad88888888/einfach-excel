import type { ProjectionRevision } from '../backend/types'
import type { ToolbarMutationLifecycleState } from './types'
import type { ToolbarMutationTicket } from './mutation-state'

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown toolbar mutation transport failure.'
  }
}

export function lifecycleFor(
  status: ToolbarMutationLifecycleState['status'],
  input: Partial<Omit<ToolbarMutationLifecycleState, 'status'>> = {},
): ToolbarMutationLifecycleState {
  return Object.freeze({
    status,
    sessionId: input.sessionId ?? 0,
    operation: input.operation ?? null,
    sheetId: input.sheetId ?? null,
    requestId: input.requestId ?? null,
    affectedRange: input.affectedRange ?? null,
    acknowledgedRevision: input.acknowledgedRevision ?? null,
    acknowledgedCount: input.acknowledgedCount ?? 0,
    totalCount: input.totalCount ?? 0,
    canRetryRefresh: input.canRetryRefresh ?? false,
    error: input.error ?? '',
  })
}

export function lifecycleForTicket(
  status: ToolbarMutationLifecycleState['status'],
  ticket: ToolbarMutationTicket,
  input: {
    readonly acknowledgedRevision?: ProjectionRevision | null
    readonly acknowledgedCount?: number
    readonly canRetryRefresh?: boolean
    readonly error?: string
  } = {},
): ToolbarMutationLifecycleState {
  return lifecycleFor(status, {
    sessionId: ticket.sessionId,
    operation: ticket.operation,
    sheetId: ticket.sheetId,
    requestId: ticket.requestId,
    affectedRange: ticket.affectedRange,
    acknowledgedRevision: input.acknowledgedRevision ?? null,
    acknowledgedCount: input.acknowledgedCount ?? 0,
    totalCount: ticket.steps.length,
    canRetryRefresh: input.canRetryRefresh ?? false,
    error: input.error ?? '',
  })
}
