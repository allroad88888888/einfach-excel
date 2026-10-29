import type { ProjectionRevision } from '../backend/types'
import { DEFAULT_HISTORY_TIMEOUT_MS } from './constants'
import { HISTORY_OUTCOME_UNKNOWN_ERROR } from './constants'
import { isProjectionRevision } from './identity'
import type { HistoryMutationTicket } from './backing-state'

export function errorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown history transport failure.'
  }
}

export function outcomeUnknownError(detail: string): string {
  return `${HISTORY_OUTCOME_UNKNOWN_ERROR} ${detail}`
}

export function refreshFailureError(error: unknown): string {
  return `History action was acknowledged, but refresh failed: ${errorMessage(error)}`
}

export function normalizeTimeout(timeoutMs: number | undefined): number {
  return typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
    ? timeoutMs
    : DEFAULT_HISTORY_TIMEOUT_MS
}

export async function withTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`${label} timed out.`)), timeoutMs)
      }),
    ])
  } finally {
    if (timeoutHandle !== undefined) clearTimeout(timeoutHandle)
  }
}

export type HistoryAcknowledgementSnapshot =
  | {
      readonly kind: 'applied'
      readonly revision: ProjectionRevision
    }
  | {
      readonly kind: 'not-applied'
      readonly reason: string
    }
  | {
      readonly kind: 'malformed'
    }

/**
 * Read the entire caller-owned acknowledgement boundary exactly once before
 * making any decision. `applied: false` is accepted only when it is correlated
 * to the exact request; it is positive proof that the backend did not mutate.
 */
export function snapshotAcknowledgement(
  acknowledgement: unknown,
  ticket: HistoryMutationTicket,
): HistoryAcknowledgementSnapshot {
  if (typeof acknowledgement !== 'object' || acknowledgement === null) {
    return Object.freeze({ kind: 'malformed' })
  }
  const result = acknowledgement as Record<string, unknown>
  let malformed = false
  const readOnce = (key: string): unknown => {
    try {
      return result[key]
    } catch {
      malformed = true
      return undefined
    }
  }
  // Do not short-circuit this boundary: even a throwing field must not make
  // another field observable twice on a subsequent classification path.
  const transactionId = readOnce('transactionId')
  const requestId = readOnce('requestId')
  const revision = readOnce('revision')
  const applied = readOnce('applied')
  const notAppliedReason = readOnce('notAppliedReason')

  if (
    malformed ||
    transactionId !== ticket.transactionId ||
    requestId !== ticket.requestId ||
    (applied !== undefined && typeof applied !== 'boolean') ||
    (notAppliedReason !== undefined && typeof notAppliedReason !== 'string')
  ) {
    return Object.freeze({ kind: 'malformed' })
  }
  if (applied === false) {
    return Object.freeze({
      kind: 'not-applied',
      reason: typeof notAppliedReason === 'string' ? notAppliedReason : '',
    })
  }
  if (!isProjectionRevision(revision)) {
    return Object.freeze({ kind: 'malformed' })
  }
  return Object.freeze({ kind: 'applied', revision })
}
