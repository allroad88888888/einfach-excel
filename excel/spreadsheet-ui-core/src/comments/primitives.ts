import type { CommentEditorAuthorityState, CommentMutationTicket } from './internal-types'
import { COMMENT_MUTATION_LEDGER_MAX } from './constants'
import type {
  CommentMutationState,
  CommentOperationAttempt,
  CommentOperationAttemptStatus,
  CommentSessionState,
} from './types'

export function isObjectRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null
}

export function isObjectLike(value: unknown): value is Record<PropertyKey, unknown> {
  return (typeof value === 'object' && value !== null) || typeof value === 'function'
}

export function commentErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown comment transport failure'
  }
}

export function freezeMutationState(state: CommentMutationState): CommentMutationState {
  return Object.freeze({ ...state })
}

export function freezeCell(cell: Readonly<{ row: number; col: number }>): Readonly<{
  row: number
  col: number
}> {
  return Object.freeze({ row: cell.row, col: cell.col })
}

export function freezeSession(session: CommentSessionState): Readonly<CommentSessionState> {
  return Object.freeze({
    sheetId: session.sheetId,
    cell: freezeCell(session.cell),
    threadId: session.threadId,
  })
}

export function freezeEditorState(state: CommentEditorAuthorityState): CommentEditorAuthorityState {
  return Object.freeze({
    sessionId: state.sessionId,
    session: state.session === null ? null : freezeSession(state.session),
    draft: state.draft,
    intent: state.intent,
    mutation: freezeMutationState(state.mutation),
  })
}

export function freezeAttempt(attempt: CommentOperationAttempt): CommentOperationAttempt {
  return Object.freeze({ ...attempt, cell: freezeCell(attempt.cell) })
}

export function freezeLedger(
  ledger: readonly CommentOperationAttempt[],
): readonly CommentOperationAttempt[] {
  return Object.freeze(ledger.map(freezeAttempt))
}

function sameCell(
  left: Readonly<{ row: number; col: number }>,
  right: Readonly<{ row: number; col: number }>,
): boolean {
  return left.row === right.row && left.col === right.col
}

export function sameSessionTarget(
  session: Readonly<CommentSessionState> | null,
  ticket: CommentMutationTicket,
): boolean {
  return (
    session !== null &&
    session.sheetId === ticket.sheetId &&
    sameCell(session.cell, ticket.cell) &&
    session.threadId === ticket.threadId
  )
}

function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) {
    return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  }
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export function nextCommentSessionId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function nextCommentRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function reserveAttemptSlot(
  ledger: readonly CommentOperationAttempt[],
): CommentOperationAttempt[] | null {
  const next = [...ledger]
  while (next.length >= COMMENT_MUTATION_LEDGER_MAX) {
    const acknowledgedIndex = next.findIndex((attempt) => attempt.status === 'local-acknowledged')
    if (acknowledgedIndex < 0) return null
    next.splice(acknowledgedIndex, 1)
  }
  return next
}

export function settleAttempt(
  ledger: readonly CommentOperationAttempt[],
  operationId: string,
  status: Exclude<CommentOperationAttemptStatus, 'pending'>,
  detail: { readonly error?: string; readonly resultRevision?: string | number },
): readonly CommentOperationAttempt[] {
  return freezeLedger(
    ledger.map((attempt) => {
      if (attempt.operationId !== operationId || attempt.status !== 'pending') return attempt
      return {
        ...attempt,
        status,
        ...(detail.error === undefined ? {} : { error: detail.error }),
        ...(detail.resultRevision === undefined ? {} : { resultRevision: detail.resultRevision }),
      }
    }),
  )
}
