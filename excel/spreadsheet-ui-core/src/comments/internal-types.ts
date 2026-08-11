import type {
  CommentIntent,
  CommentMutationAction,
  CommentMutationPortSource,
  CommentMutationState,
  CommentOperationAttempt,
  CommentSessionState,
  PostCommentRequest,
  ResolveCommentThreadRequest,
} from './types'

export interface CommentEditorAuthorityState {
  readonly sessionId: number
  readonly session: Readonly<CommentSessionState> | null
  readonly draft: string
  readonly intent: CommentIntent | null
  readonly mutation: CommentMutationState
}

export interface CommentMutationInputSnapshot {
  readonly action: CommentMutationAction
  readonly receiver: CommentMutationPortSource | null
  readonly execute:
    | CommentMutationPortSource['postComment']
    | CommentMutationPortSource['resolveCommentThread']
}

export interface CommentMutationCapture {
  readonly kind: 'capture'
  readonly editor: CommentEditorAuthorityState
}

export interface CommentMutationTicket {
  readonly sessionId: number
  readonly requestId: number
  readonly operationId: string
  readonly deadlineAt: number
  readonly action: CommentMutationAction
  readonly sheetId: string
  readonly cell: Readonly<{ row: number; col: number }>
  readonly threadId?: string
}

export interface CommentMutationReservation {
  readonly kind: 'reservation'
  readonly editor: CommentEditorAuthorityState
  readonly ledger: readonly CommentOperationAttempt[]
  readonly expectedSequence: number
  readonly input: CommentMutationInputSnapshot
  readonly ticket: CommentMutationTicket
  readonly request: Readonly<PostCommentRequest | ResolveCommentThreadRequest>
  readonly attempt: CommentOperationAttempt
}

export interface CommentAcknowledgementCapture {
  readonly kind: 'acknowledgement-capture'
  readonly ticket: CommentMutationTicket
}

export type CommentMutationLaunchState =
  | CommentMutationCapture
  | CommentMutationReservation
  | CommentAcknowledgementCapture
  | null

export type CommentTransportOutcome =
  | { readonly kind: 'fulfilled'; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly error: unknown }
  | { readonly kind: 'deadline-exceeded' }
