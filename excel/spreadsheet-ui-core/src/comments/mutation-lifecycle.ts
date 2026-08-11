import { atom } from '@einfach/core'
import type {
  CommentAcknowledgementCapture,
  CommentEditorAuthorityState,
  CommentMutationReservation,
  CommentMutationTicket,
} from './internal-types'
import {
  freezeEditorState,
  freezeLedger,
  reserveAttemptSlot,
  sameSessionTarget,
  settleAttempt,
} from './primitives'
import {
  commentEditorStateAtom,
  commentMutationLaunchStateAtom,
  commentOperationAttemptLedgerStateAtom,
  commentPendingTicketAtom,
  commentRequestSequenceAtom,
} from './state'
import type {
  CommentIntent,
  CommentOperationAttemptStatus,
  PostCommentRequest,
  ResolveCommentThreadRequest,
} from './types'

function matchesOwnedEditor(
  editor: CommentEditorAuthorityState,
  ticket: CommentMutationTicket,
): boolean {
  return (
    editor.sessionId === ticket.sessionId &&
    sameSessionTarget(editor.session, ticket) &&
    editor.mutation.phase === 'PendingPublished' &&
    editor.mutation.action === ticket.action &&
    editor.mutation.requestId === ticket.requestId
  )
}

export const beginCommentMutationLaunchAtom = atom(
  null,
  (get, set, reservation: CommentMutationReservation): boolean => {
    if (
      get(commentMutationLaunchStateAtom) !== reservation ||
      get(commentEditorStateAtom) !== reservation.editor ||
      get(commentRequestSequenceAtom) !== reservation.expectedSequence ||
      get(commentOperationAttemptLedgerStateAtom) !== reservation.ledger ||
      get(commentMutationLaunchStateAtom) !== reservation
    ) {
      return false
    }
    const reservedLedger = reserveAttemptSlot(reservation.ledger)
    if (reservedLedger === null) return false

    const intent: CommentIntent =
      reservation.request.kind === 'post-comment'
        ? { type: 'comment.post', request: reservation.request as PostCommentRequest }
        : {
            type: 'comment.resolve-thread',
            request: reservation.request as ResolveCommentThreadRequest,
          }
    set(commentRequestSequenceAtom, reservation.ticket.requestId)
    set(
      commentOperationAttemptLedgerStateAtom,
      freezeLedger([...reservedLedger, reservation.attempt]),
    )
    set(commentPendingTicketAtom, reservation.ticket)
    set(
      commentEditorStateAtom,
      freezeEditorState({
        ...reservation.editor,
        intent,
        mutation: {
          phase: 'PendingPublished',
          action: reservation.ticket.action,
          requestId: reservation.ticket.requestId,
          error: null,
        },
      }),
    )
    return true
  },
)

const revokeUnlaunchedCommentMutationAtom = atom(
  null,
  (get, set, reservation: CommentMutationReservation): void => {
    const ledger = get(commentOperationAttemptLedgerStateAtom)
    const nextLedger = ledger.filter(
      (attempt) =>
        attempt.operationId !== reservation.ticket.operationId || attempt.status !== 'pending',
    )
    if (nextLedger.length !== ledger.length) {
      set(commentOperationAttemptLedgerStateAtom, freezeLedger(nextLedger))
    }
    if (get(commentPendingTicketAtom) === reservation.ticket) {
      set(commentPendingTicketAtom, null)
    }
    const editor = get(commentEditorStateAtom)
    if (matchesOwnedEditor(editor, reservation.ticket)) {
      set(
        commentEditorStateAtom,
        freezeEditorState({
          ...editor,
          intent: null,
          mutation: {
            phase: 'ErrorOpen',
            action: reservation.ticket.action,
            requestId: reservation.ticket.requestId,
            error: 'Comment target changed before transport dispatch',
          },
        }),
      )
    }
  },
)

export const guardCommentTransportLaunchAtom = atom(
  null,
  (get, set, reservation: CommentMutationReservation): boolean => {
    const ledger = get(commentOperationAttemptLedgerStateAtom)
    if (
      get(commentMutationLaunchStateAtom) === reservation &&
      get(commentPendingTicketAtom) === reservation.ticket &&
      get(commentRequestSequenceAtom) === reservation.ticket.requestId &&
      matchesOwnedEditor(get(commentEditorStateAtom), reservation.ticket) &&
      ledger.some(
        (attempt) =>
          attempt.operationId === reservation.ticket.operationId && attempt.status === 'pending',
      ) &&
      get(commentMutationLaunchStateAtom) === reservation
    ) {
      return true
    }
    set(revokeUnlaunchedCommentMutationAtom, reservation)
    return false
  },
)

export const releaseCommentMutationLaunchAtom = atom(
  null,
  (get, set, reservation: CommentMutationReservation): void => {
    if (get(commentMutationLaunchStateAtom) === reservation) {
      set(commentMutationLaunchStateAtom, null)
    }
  },
)

export const settleCommentAttemptAtom = atom(
  null,
  (
    get,
    set,
    input: {
      readonly ticket: CommentMutationTicket
      readonly status: Exclude<CommentOperationAttemptStatus, 'pending'>
      readonly error?: string
      readonly resultRevision?: string | number
    },
  ): void => {
    set(
      commentOperationAttemptLedgerStateAtom,
      settleAttempt(
        get(commentOperationAttemptLedgerStateAtom),
        input.ticket.operationId,
        input.status,
        { error: input.error, resultRevision: input.resultRevision },
      ),
    )
    if (get(commentPendingTicketAtom) === input.ticket) set(commentPendingTicketAtom, null)
  },
)

export const updateOwnedCommentMutationAtom = atom(
  null,
  (
    get,
    set,
    input: {
      readonly ticket: CommentMutationTicket
      readonly phase: 'OutcomeUnknownBlocked' | 'LocalAcknowledged'
      readonly error: string | null
    },
  ): void => {
    const editor = get(commentEditorStateAtom)
    if (!matchesOwnedEditor(editor, input.ticket)) return
    set(
      commentEditorStateAtom,
      freezeEditorState({
        ...editor,
        session: input.phase === 'LocalAcknowledged' ? null : editor.session,
        draft: input.phase === 'LocalAcknowledged' ? '' : editor.draft,
        intent: null,
        mutation: {
          phase: input.phase,
          action: input.ticket.action,
          requestId: input.ticket.requestId,
          error: input.error,
        },
      }),
    )
  },
)

export const beginCommentAcknowledgementCaptureAtom = atom(
  null,
  (get, set, ticket: CommentMutationTicket): CommentAcknowledgementCapture | null => {
    if (get(commentMutationLaunchStateAtom) !== null) return null
    const ledger = get(commentOperationAttemptLedgerStateAtom)
    if (
      !ledger.some(
        (attempt) => attempt.operationId === ticket.operationId && attempt.status === 'pending',
      )
    ) {
      return null
    }
    const capture: CommentAcknowledgementCapture = Object.freeze({
      kind: 'acknowledgement-capture',
      ticket,
    })
    set(commentMutationLaunchStateAtom, capture)
    return capture
  },
)

export const finishCommentAcknowledgementCaptureAtom = atom(
  null,
  (get, set, capture: CommentAcknowledgementCapture): boolean => {
    if (get(commentMutationLaunchStateAtom) !== capture) return false
    set(commentMutationLaunchStateAtom, null)
    return true
  },
)
