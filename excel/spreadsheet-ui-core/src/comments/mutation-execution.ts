import { atom, type Setter } from '@einfach/core'
import type { CommentMutationReservation, CommentTransportOutcome } from './internal-types'
import {
  beginCommentAcknowledgementCaptureAtom,
  beginCommentMutationLaunchAtom,
  finishCommentAcknowledgementCaptureAtom,
  guardCommentTransportLaunchAtom,
  releaseCommentMutationLaunchAtom,
  settleCommentAttemptAtom,
  updateOwnedCommentMutationAtom,
} from './mutation-lifecycle'
import { reserveCommentMutationLaunchAtom } from './mutation-reservation'
import { commentErrorMessage } from './primitives'
import { snapshotAcknowledgement } from './snapshots'
import type {
  PostCommentRequest,
  ResolveCommentThreadRequest,
  RunCommentMutationInput,
} from './types'

function copyMutationRequest(
  request: Readonly<PostCommentRequest | ResolveCommentThreadRequest>,
): PostCommentRequest | ResolveCommentThreadRequest {
  return request.kind === 'post-comment'
    ? {
        kind: request.kind,
        sheetId: request.sheetId,
        cell: { row: request.cell.row, col: request.cell.col },
        threadId: request.threadId,
        body: request.body,
        requestId: request.requestId,
      }
    : {
        kind: request.kind,
        sheetId: request.sheetId,
        threadId: request.threadId,
        requestId: request.requestId,
      }
}

async function executeReservedCommentMutation(
  set: Setter,
  reservation: CommentMutationReservation,
): Promise<void> {
  const started = set(beginCommentMutationLaunchAtom, reservation)
  if (!started) {
    set(releaseCommentMutationLaunchAtom, reservation)
    return
  }

  const launchCurrent = set(guardCommentTransportLaunchAtom, reservation)
  set(releaseCommentMutationLaunchAtom, reservation)
  if (!launchCurrent) return

  let deadlineHandle: ReturnType<typeof setTimeout> | null = null
  const deadlineOutcome = new Promise<CommentTransportOutcome>((resolve) => {
    deadlineHandle = setTimeout(
      () => resolve({ kind: 'deadline-exceeded' }),
      Math.max(0, reservation.ticket.deadlineAt - Date.now()),
    )
  })
  let transportOutcome: Promise<CommentTransportOutcome>
  try {
    transportOutcome = Promise.resolve(
      Reflect.apply(reservation.input.execute!, reservation.input.receiver, [
        copyMutationRequest(reservation.request),
      ]),
    ).then<CommentTransportOutcome, CommentTransportOutcome>(
      (value) => ({ kind: 'fulfilled', value }),
      (error) => ({ kind: 'rejected', error }),
    )
  } catch (error) {
    transportOutcome = Promise.resolve({ kind: 'rejected', error })
  }

  const outcome = await Promise.race([transportOutcome, deadlineOutcome])
  if (deadlineHandle !== null) clearTimeout(deadlineHandle)

  if (outcome.kind === 'deadline-exceeded') {
    const message = `Comment ${reservation.ticket.action} exceeded the Core deadline; outcome is unknown`
    set(settleCommentAttemptAtom, {
      ticket: reservation.ticket,
      status: 'outcome-unknown',
      error: message,
    })
    set(updateOwnedCommentMutationAtom, {
      ticket: reservation.ticket,
      phase: 'OutcomeUnknownBlocked',
      error: message,
    })
    return
  }

  if (outcome.kind === 'rejected') {
    const message = commentErrorMessage(outcome.error)
    set(settleCommentAttemptAtom, {
      ticket: reservation.ticket,
      status: 'outcome-unknown',
      error: message,
    })
    set(updateOwnedCommentMutationAtom, {
      ticket: reservation.ticket,
      phase: 'OutcomeUnknownBlocked',
      error: message,
    })
    return
  }

  const capture = set(beginCommentAcknowledgementCaptureAtom, reservation.ticket)
  if (capture === null) {
    const message = 'Comment acknowledgement capture lost local authority'
    set(settleCommentAttemptAtom, {
      ticket: reservation.ticket,
      status: 'outcome-unknown',
      error: message,
    })
    set(updateOwnedCommentMutationAtom, {
      ticket: reservation.ticket,
      phase: 'OutcomeUnknownBlocked',
      error: message,
    })
    return
  }

  const acknowledgementSnapshot = snapshotAcknowledgement(outcome.value, reservation.ticket)
  const captureStayedCurrent = set(finishCommentAcknowledgementCaptureAtom, capture)
  if (!captureStayedCurrent) {
    const message = 'Comment acknowledgement getters changed Core authority re-entrantly'
    set(settleCommentAttemptAtom, {
      ticket: reservation.ticket,
      status: 'outcome-unknown',
      error: message,
    })
    set(updateOwnedCommentMutationAtom, {
      ticket: reservation.ticket,
      phase: 'OutcomeUnknownBlocked',
      error: message,
    })
    return
  }

  if (acknowledgementSnapshot.acknowledgement === null) {
    const message =
      acknowledgementSnapshot.error ?? 'Comment acknowledgement was invalid or mismatched'
    set(settleCommentAttemptAtom, {
      ticket: reservation.ticket,
      status: 'outcome-unknown',
      error: message,
    })
    set(updateOwnedCommentMutationAtom, {
      ticket: reservation.ticket,
      phase: 'OutcomeUnknownBlocked',
      error: message,
    })
    return
  }

  const acknowledgement = acknowledgementSnapshot.acknowledgement
  set(settleCommentAttemptAtom, {
    ticket: reservation.ticket,
    status: 'local-acknowledged',
    resultRevision: acknowledgement.revision,
  })
  set(updateOwnedCommentMutationAtom, {
    ticket: reservation.ticket,
    phase: 'LocalAcknowledged',
    error: null,
  })
}

/** Publishes immutable pending evidence before invoking one selected backend port. */
export const runCommentMutationAtom = atom(
  null,
  (_get, set, input: RunCommentMutationInput): Promise<void> => {
    const reservation = set(reserveCommentMutationLaunchAtom, input)
    if (reservation === null) return Promise.resolve()
    return Promise.resolve().then(() => executeReservedCommentMutation(set, reservation))
  },
)
runCommentMutationAtom.debugLabel = 'spreadsheet.comments.runMutation'
