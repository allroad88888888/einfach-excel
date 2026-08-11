/** @jsxImportSource solid-js */

import { Show, type Accessor } from 'solid-js'
import type {
  CommentMutationAction,
  CommentMutationState,
  CommentSessionState,
} from '@einfach/spreadsheet-ui-core'

export const COMMENT_THREAD_TITLE_ID = 'spreadsheet-comment-thread-title'
export const COMMENT_THREAD_STATUS_ID = 'spreadsheet-comment-thread-status'

export interface CommentThreadPresentationProps {
  readonly class?: string
  readonly testId: string
  readonly session: Accessor<Readonly<CommentSessionState> | null>
  readonly draft: Accessor<string>
  readonly mutation: Accessor<CommentMutationState>
  readonly submissionBlocked: Accessor<boolean>
  readonly closeLabel: string
  readonly setRootRef: (element: HTMLDivElement) => void
  readonly setTextareaRef: (element: HTMLTextAreaElement) => void
  readonly onDraftInput: (draft: string) => void
  readonly onRun: (action: CommentMutationAction) => void
  readonly onClose: () => void
}

function columnLabel(column: number): string {
  let value = column + 1
  let label = ''
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

function cellLabel(session: Readonly<CommentSessionState> | null): string {
  return session === null
    ? ''
    : `${session.sheetId} · ${columnLabel(session.cell.col)}${session.cell.row + 1}`
}

export function CommentThreadPresentation(props: CommentThreadPresentationProps) {
  const isPending = () => props.mutation().phase === 'PendingPublished'
  const isUnknown = () => props.mutation().phase === 'OutcomeUnknownBlocked'
  const canRetry = () => props.mutation().phase === 'ErrorOpen' && props.mutation().action !== null

  return (
    <div
      ref={props.setRootRef}
      class={`comment-thread spreadsheet-comment-thread ${props.class ?? ''}`.trim()}
      data-testid={props.testId}
      data-status={props.mutation().phase}
      role="dialog"
      aria-modal="true"
      aria-labelledby={COMMENT_THREAD_TITLE_ID}
      aria-describedby={props.mutation().error === null ? undefined : COMMENT_THREAD_STATUS_ID}
      aria-busy={isPending()}
    >
      <header class="comment-thread-header">
        <div>
          <h2 id={COMMENT_THREAD_TITLE_ID}>
            {props.session()?.threadId === undefined ? 'New comment' : 'Comment thread'}
          </h2>
          <span class="comment-thread-cell" data-testid="comment-thread-cell">
            {cellLabel(props.session())}
          </span>
        </div>
        <button
          type="button"
          class="dialog-close-x"
          data-testid="dialog-close-x"
          aria-label={props.closeLabel}
          onClick={props.onClose}
        >
          ×
        </button>
      </header>

      <label class="comment-thread-compose-label" for="spreadsheet-comment-thread-draft">
        {props.session()?.threadId === undefined ? 'Comment' : 'Reply'}
      </label>
      <textarea
        ref={props.setTextareaRef}
        id="spreadsheet-comment-thread-draft"
        class="comment-thread-textarea spreadsheet-comment-thread-textarea"
        data-testid="comment-thread-textarea"
        value={props.draft()}
        disabled={isPending() || isUnknown()}
        onInput={(event) => props.onDraftInput(event.currentTarget.value)}
      />

      <Show when={props.mutation().error !== null}>
        <div id={COMMENT_THREAD_STATUS_ID} class="comment-thread-status" role="alert">
          <p class="comment-mutation-error" data-testid="comment-mutation-error">
            {props.mutation().error}
          </p>
          <Show when={isUnknown()}>
            <p data-testid="comment-outcome-unknown-help">
              The result is unknown. Verify the server state before trying again.
            </p>
          </Show>
        </div>
      </Show>

      <footer class="comment-thread-actions">
        <Show when={canRetry()}>
          <button
            type="button"
            class="comment-retry-button"
            data-testid="comment-retry-button"
            onClick={() => props.onRun(props.mutation().action!)}
          >
            Retry
          </button>
        </Show>
        <Show when={props.session()?.threadId !== undefined}>
          <button
            type="button"
            class="comment-resolve-button"
            data-testid="comment-resolve-button"
            disabled={props.submissionBlocked()}
            onClick={() => props.onRun('resolve')}
          >
            Resolve thread
          </button>
        </Show>
        <button
          type="button"
          class="comment-post-button"
          data-testid="comment-post-button"
          disabled={props.submissionBlocked()}
          onClick={() => props.onRun('post')}
        >
          {props.session()?.threadId === undefined ? 'Post' : 'Reply'}
        </button>
        <button
          type="button"
          class="comment-close-button"
          data-testid="comment-close-button"
          onClick={props.onClose}
        >
          Close
        </button>
      </footer>
    </div>
  )
}
