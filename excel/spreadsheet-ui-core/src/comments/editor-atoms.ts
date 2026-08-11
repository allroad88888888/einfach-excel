import { atom, type Atom } from '@einfach/core'
import { INITIAL_COMMENT_MUTATION_STATE } from './constants'
import { freezeEditorState, freezeSession, nextCommentSessionId } from './primitives'
import { snapshotSession } from './snapshots'
import { commentEditorStateAtom, invalidateCommentCapture } from './state'
import type { CommentIntent, CommentSessionState } from './types'

const replaceCommentSessionAtom = atom(
  null,
  (get, set, value: CommentSessionState | null): void => {
    invalidateCommentCapture(get, set)
    const previous = get(commentEditorStateAtom)
    const sessionId = nextCommentSessionId(previous.sessionId)
    if (sessionId === null) {
      set(
        commentEditorStateAtom,
        freezeEditorState({
          ...previous,
          mutation: {
            phase: 'ErrorOpen',
            action: null,
            requestId: null,
            error: 'Comment session identity space is exhausted or corrupt',
          },
        }),
      )
      return
    }
    const session = value === null ? null : snapshotSession(value)
    if ((value !== null && session === null) || get(commentEditorStateAtom) !== previous) return
    set(
      commentEditorStateAtom,
      freezeEditorState({
        sessionId,
        session: session === null ? null : freezeSession(session),
        draft: '',
        intent: null,
        mutation: INITIAL_COMMENT_MUTATION_STATE,
      }),
    )
  },
)

export const commentSessionAtom = atom(
  (get): Readonly<CommentSessionState> | null => get(commentEditorStateAtom).session,
  (_get, set, value: CommentSessionState | null): void => {
    set(replaceCommentSessionAtom, value)
  },
)
commentSessionAtom.debugLabel = 'spreadsheet.comments.session'

export const commentEditorDraftAtom: Atom<string> = atom(
  (get): string => get(commentEditorStateAtom).draft,
)
commentEditorDraftAtom.debugLabel = 'spreadsheet.comments.draft'

export const commentIntentAtom = atom(
  (get): CommentIntent | null => get(commentEditorStateAtom).intent,
  (get, set, intent: CommentIntent | null): void => {
    invalidateCommentCapture(get, set)
    const editor = get(commentEditorStateAtom)
    if (editor.mutation.phase === 'PendingPublished') return
    set(commentEditorStateAtom, freezeEditorState({ ...editor, intent }))
  },
)
commentIntentAtom.debugLabel = 'spreadsheet.comments.intent'

export const openCommentSessionAtom = atom(null, (_get, set, input: CommentSessionState): void => {
  set(replaceCommentSessionAtom, input)
})
openCommentSessionAtom.debugLabel = 'spreadsheet.comments.openSession'

export const closeCommentSessionAtom = atom(null, (_get, set): void => {
  set(replaceCommentSessionAtom, null)
})
closeCommentSessionAtom.debugLabel = 'spreadsheet.comments.closeSession'

export const setCommentDraftAtom = atom(null, (get, set, draft: string): void => {
  invalidateCommentCapture(get, set)
  const editor = get(commentEditorStateAtom)
  if (
    typeof draft !== 'string' ||
    editor.mutation.phase === 'PendingPublished' ||
    editor.mutation.phase === 'OutcomeUnknownBlocked'
  ) {
    return
  }
  set(
    commentEditorStateAtom,
    freezeEditorState({
      ...editor,
      draft,
      mutation: INITIAL_COMMENT_MUTATION_STATE,
    }),
  )
})
setCommentDraftAtom.debugLabel = 'spreadsheet.comments.setDraft'
