/** @jsxImportSource solid-js */

import { Show } from 'solid-js'
import { useAtomValue } from '@einfach/solid'
import { useT } from '../i18n'
import {
  closeCommentSessionAtom,
  commentEditorDraftAtom,
  commentMutationStateAtom,
  commentMutationSubmissionBlockedAtom,
  commentSessionAtom,
  runCommentMutationAtom,
  setCommentDraftAtom,
  type CommentMutationAction,
} from '@einfach/spreadsheet-ui-core'
import { useSpreadsheetBackend, useSpreadsheetUiStore } from '../provider/hooks'
import { CommentThreadPresentation } from './CommentThreadPresentation'
import { useCommentThreadInteraction } from './use-comment-thread-interaction'

if (typeof process === 'undefined' || process.env.VITEST !== 'true') {
  void import('@einfach/spreadsheet-ui-styles/features/comment-thread.css')
}

export interface SpreadsheetCommentThreadProps {
  class?: string
  'data-testid'?: string
}

/** Connects the comment popover to its Core-owned Atom state machine. */
export function SpreadsheetCommentThread(props: SpreadsheetCommentThreadProps) {
  const t = useT()
  const store = useSpreadsheetUiStore()
  const backend = useSpreadsheetBackend()
  const session = useAtomValue(commentSessionAtom)
  const draft = useAtomValue(commentEditorDraftAtom)
  const mutation = useAtomValue(commentMutationStateAtom)
  const submissionBlocked = useAtomValue(commentMutationSubmissionBlockedAtom)

  function handleClose() {
    store.setter(closeCommentSessionAtom)
  }

  function handleRun(action: CommentMutationAction) {
    void store.setter(runCommentMutationAtom, { action, source: backend })
  }

  const interaction = useCommentThreadInteraction(session, handleClose)

  return (
    <Show when={session() !== null}>
      <CommentThreadPresentation
        class={props.class}
        testId={props['data-testid'] ?? 'comment-thread'}
        session={session}
        draft={draft}
        mutation={mutation}
        submissionBlocked={submissionBlocked}
        closeLabel={t('dialog.close.label')}
        setRootRef={interaction.rootRef}
        setTextareaRef={interaction.textareaRef}
        onDraftInput={(nextDraft) => store.setter(setCommentDraftAtom, nextDraft)}
        onRun={handleRun}
        onClose={handleClose}
      />
    </Show>
  )
}
