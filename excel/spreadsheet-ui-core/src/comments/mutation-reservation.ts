import { atom, type Getter, type Setter } from '@einfach/core'
import { COMMENT_BODY_MAX, COMMENT_MUTATION_TIMEOUT_MS } from './constants'
import type { CommentMutationCapture, CommentMutationReservation } from './internal-types'
import {
  freezeAttempt,
  freezeCell,
  freezeEditorState,
  nextCommentRequestId,
  reserveAttemptSlot,
} from './primitives'
import { snapshotMutationInput } from './snapshots'
import {
  commentEditorStateAtom,
  commentMutationLaunchStateAtom,
  commentOperationAttemptLedgerStateAtom,
  commentRequestSequenceAtom,
} from './state'
import type {
  CommentMutationAction,
  CommentOperationAttempt,
  PostCommentRequest,
  ResolveCommentThreadRequest,
  RunCommentMutationInput,
} from './types'

function releaseCapture(
  get: Getter,
  set: Setter,
  capture: CommentMutationCapture,
  detail: {
    readonly phase: 'ErrorOpen' | 'OutcomeUnknownBlocked'
    readonly action?: CommentMutationAction
    readonly error: string
  } | null,
): null {
  if (get(commentMutationLaunchStateAtom) !== capture) return null
  const editor = get(commentEditorStateAtom)
  if (detail !== null && editor === capture.editor) {
    set(
      commentEditorStateAtom,
      freezeEditorState({
        ...editor,
        mutation: {
          phase: detail.phase,
          action: detail.action ?? null,
          requestId: null,
          error: detail.error,
        },
      }),
    )
  }
  if (get(commentMutationLaunchStateAtom) === capture) {
    set(commentMutationLaunchStateAtom, null)
  }
  return null
}

function validateReservationReadiness(
  get: Getter,
  set: Setter,
  capture: CommentMutationCapture,
): readonly CommentOperationAttempt[] | null {
  const ledger = get(commentOperationAttemptLedgerStateAtom)
  if (ledger.some((attempt) => attempt.status === 'outcome-unknown')) {
    return releaseCapture(get, set, capture, {
      phase: 'OutcomeUnknownBlocked',
      error: 'Comments are blocked by an operation with an unknown outcome',
    })
  }
  if (ledger.some((attempt) => attempt.status === 'pending')) {
    return releaseCapture(get, set, capture, {
      phase: 'ErrorOpen',
      error: 'A comment operation is already pending',
    })
  }
  if (reserveAttemptSlot(ledger) === null) {
    return releaseCapture(get, set, capture, {
      phase: 'ErrorOpen',
      error: 'Comment operation journal is full of unresolved attempts',
    })
  }
  return ledger
}

export const reserveCommentMutationLaunchAtom = atom(
  null,
  (get, set, input: RunCommentMutationInput): CommentMutationReservation | null => {
    const existingLaunch = get(commentMutationLaunchStateAtom)
    if (existingLaunch !== null) {
      if (existingLaunch.kind === 'capture' || existingLaunch.kind === 'acknowledgement-capture') {
        set(commentMutationLaunchStateAtom, null)
      }
      return null
    }

    const editor = get(commentEditorStateAtom)
    if (
      editor.session === null ||
      editor.mutation.phase === 'PendingPublished' ||
      editor.mutation.phase === 'OutcomeUnknownBlocked'
    ) {
      return null
    }

    const capture: CommentMutationCapture = Object.freeze({ kind: 'capture', editor })
    set(commentMutationLaunchStateAtom, capture)
    const ledger = validateReservationReadiness(get, set, capture)
    if (ledger === null) return null

    const inputSnapshot = snapshotMutationInput(input)
    if (get(commentMutationLaunchStateAtom) !== capture || get(commentEditorStateAtom) !== editor) {
      return releaseCapture(get, set, capture, null)
    }
    if (inputSnapshot === null) {
      return releaseCapture(get, set, capture, {
        phase: 'ErrorOpen',
        error: 'Comment mutation input could not be read safely',
      })
    }
    if (inputSnapshot.execute === undefined || inputSnapshot.receiver === null) {
      return releaseCapture(get, set, capture, {
        phase: 'ErrorOpen',
        action: inputSnapshot.action,
        error: `Comment ${inputSnapshot.action} is unavailable`,
      })
    }

    const session = editor.session
    if (
      inputSnapshot.action === 'post' &&
      (editor.draft.trim().length === 0 || editor.draft.length > COMMENT_BODY_MAX)
    ) {
      return releaseCapture(get, set, capture, {
        phase: 'ErrorOpen',
        action: inputSnapshot.action,
        error: 'A non-empty comment body within the supported size is required',
      })
    }
    if (inputSnapshot.action === 'resolve' && session.threadId === undefined) {
      return releaseCapture(get, set, capture, {
        phase: 'ErrorOpen',
        action: inputSnapshot.action,
        error: 'Resolving a comment requires an exact thread id',
      })
    }

    const expectedSequence = get(commentRequestSequenceAtom)
    const requestId = nextCommentRequestId(expectedSequence)
    if (requestId === null) {
      return releaseCapture(get, set, capture, {
        phase: 'ErrorOpen',
        action: inputSnapshot.action,
        error: 'Comment request ticket space is exhausted or corrupt',
      })
    }
    if (ledger.some((attempt) => attempt.requestId === requestId)) {
      return releaseCapture(get, set, capture, {
        phase: 'OutcomeUnknownBlocked',
        action: inputSnapshot.action,
        error: 'Comment request ticket reuse was detected',
      })
    }

    const cell = freezeCell(session.cell)
    const operationId = `comment-${requestId}`
    const deadlineAt = Date.now() + COMMENT_MUTATION_TIMEOUT_MS
    const ticket = Object.freeze({
      sessionId: editor.sessionId,
      requestId,
      operationId,
      deadlineAt,
      action: inputSnapshot.action,
      sheetId: session.sheetId,
      cell,
      threadId: session.threadId,
    })
    const request: Readonly<PostCommentRequest | ResolveCommentThreadRequest> =
      inputSnapshot.action === 'post'
        ? Object.freeze({
            kind: 'post-comment',
            sheetId: ticket.sheetId,
            cell,
            threadId: ticket.threadId,
            body: editor.draft,
            requestId,
          })
        : Object.freeze({
            kind: 'resolve-comment-thread',
            sheetId: ticket.sheetId,
            threadId: ticket.threadId!,
            requestId,
          })
    const attempt = freezeAttempt({
      operationId,
      requestId,
      sessionId: editor.sessionId,
      deadlineAt,
      action: inputSnapshot.action,
      sheetId: ticket.sheetId,
      cell,
      threadId: ticket.threadId,
      status: 'pending',
    })
    const reservation: CommentMutationReservation = Object.freeze({
      kind: 'reservation',
      editor,
      ledger,
      expectedSequence,
      input: inputSnapshot,
      ticket,
      request,
      attempt,
    })
    if (
      get(commentMutationLaunchStateAtom) !== capture ||
      get(commentEditorStateAtom) !== editor ||
      get(commentRequestSequenceAtom) !== expectedSequence ||
      get(commentOperationAttemptLedgerStateAtom) !== ledger
    ) {
      return releaseCapture(get, set, capture, null)
    }
    set(commentMutationLaunchStateAtom, reservation)
    return reservation
  },
)
