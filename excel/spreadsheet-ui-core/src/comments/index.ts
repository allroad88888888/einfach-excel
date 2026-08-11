import type { Atom } from '@einfach/core'
import { commentEditorDraftAtom as editorDraftAtom } from './editor-atoms'

export { COMMENT_MUTATION_LEDGER_MAX, COMMENT_MUTATION_TIMEOUT_MS } from './constants'
export {
  closeCommentSessionAtom,
  commentIntentAtom,
  commentSessionAtom,
  openCommentSessionAtom,
  setCommentDraftAtom,
} from './editor-atoms'
export { runCommentMutationAtom } from './mutation-execution'
export { nextCommentRequestId, nextCommentSessionId } from './primitives'
export {
  commentMutationBlockedAtom,
  commentMutationPendingAtom,
  commentMutationStateAtom,
  commentMutationSubmissionBlockedAtom,
  commentOperationAttemptLedgerAtom,
  commentRuntimeStatusAtom,
} from './state'
export * from './types'

export const commentEditorDraftAtom: Atom<string> = editorDraftAtom
