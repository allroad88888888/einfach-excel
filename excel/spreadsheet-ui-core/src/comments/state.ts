import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import { INITIAL_COMMENT_MUTATION_STATE } from './constants'
import type {
  CommentEditorAuthorityState,
  CommentMutationLaunchState,
  CommentMutationTicket,
} from './internal-types'
import { freezeEditorState, freezeLedger, freezeMutationState } from './primitives'
import type { CommentMutationState, CommentOperationAttempt, CommentRuntimeStatus } from './types'

const initialEditorState: CommentEditorAuthorityState = freezeEditorState({
  sessionId: 0,
  session: null,
  draft: '',
  intent: null,
  mutation: INITIAL_COMMENT_MUTATION_STATE,
})

export const commentEditorStateAtom = atom<CommentEditorAuthorityState>(initialEditorState)
commentEditorStateAtom.debugLabel = 'spreadsheet.comments.editorState'

export const commentRequestSequenceAtom = atom(0)
export const commentMutationLaunchStateAtom = atom<CommentMutationLaunchState>(null)
export const commentPendingTicketAtom = atom<CommentMutationTicket | null>(null)
export const commentOperationAttemptLedgerStateAtom = atom<readonly CommentOperationAttempt[]>(
  Object.freeze([]),
)
commentOperationAttemptLedgerStateAtom.debugLabel =
  'spreadsheet.comments.operationAttemptLedgerState'

export const commentOperationAttemptLedgerAtom: Atom<readonly CommentOperationAttempt[]> = atom(
  (get) => freezeLedger(get(commentOperationAttemptLedgerStateAtom)),
)
commentOperationAttemptLedgerAtom.debugLabel = 'spreadsheet.comments.operationAttemptLedger'

export const commentMutationStateAtom: Atom<CommentMutationState> = atom((get) =>
  freezeMutationState(get(commentEditorStateAtom).mutation),
)
commentMutationStateAtom.debugLabel = 'spreadsheet.comments.mutationState'

export const commentMutationPendingAtom = atom((get): boolean =>
  get(commentOperationAttemptLedgerStateAtom).some((attempt) => attempt.status === 'pending'),
)
commentMutationPendingAtom.debugLabel = 'spreadsheet.comments.mutationPending'

export const commentMutationBlockedAtom = atom((get): boolean =>
  get(commentOperationAttemptLedgerStateAtom).some(
    (attempt) => attempt.status === 'outcome-unknown',
  ),
)
commentMutationBlockedAtom.debugLabel = 'spreadsheet.comments.mutationBlocked'

export const commentMutationSubmissionBlockedAtom = atom(
  (get): boolean =>
    get(commentMutationLaunchStateAtom) !== null ||
    get(commentOperationAttemptLedgerStateAtom).some(
      (attempt) => attempt.status === 'pending' || attempt.status === 'outcome-unknown',
    ),
)
commentMutationSubmissionBlockedAtom.debugLabel = 'spreadsheet.comments.submissionBlocked'

export const commentRuntimeStatusAtom: Atom<CommentRuntimeStatus> = atom((get) => {
  const editor = get(commentEditorStateAtom)
  if (editor.mutation.phase !== 'Idle') return editor.mutation.phase
  if (editor.session === null) return 'Closed'
  return editor.draft.length === 0 ? 'OpenClean' : 'OpenDirty'
})
commentRuntimeStatusAtom.debugLabel = 'spreadsheet.comments.runtimeStatus'

export function invalidateCommentCapture(get: Getter, set: Setter): void {
  const launch = get(commentMutationLaunchStateAtom)
  if (launch !== null) set(commentMutationLaunchStateAtom, null)
}
