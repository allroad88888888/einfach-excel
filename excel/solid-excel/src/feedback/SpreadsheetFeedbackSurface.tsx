import { Show } from 'solid-js'

import type { SpreadsheetFeedbackSurfaceProps } from './types'

/**
 * The small, host-neutral rendering seam for command loading and retryable
 * failures. It owns no product state; hosts decide where it is mounted.
 */
export function SpreadsheetFeedbackSurface(props: SpreadsheetFeedbackSurfaceProps) {
  const testId = () => props['data-testid'] ?? 'feedback-surface'
  const className = () => `spreadsheet-feedback-surface${props.class ? ` ${props.class}` : ''}`

  return (
    <Show when={props.feedback()}>
      {(feedback) => {
        const isError = () => feedback().kind === 'error'
        const isRetryable = () => isError() && props.onRetry !== undefined
        const isDismissible = () => isError() && props.onDismiss !== undefined
        const retryLabel = () => {
          const value = feedback()
          return value.kind === 'error'
            ? (value.retryLabel ?? props.retryLabel ?? 'Retry')
            : (props.retryLabel ?? 'Retry')
        }

        return (
          <section
            class={className()}
            role={isError() ? 'alert' : 'status'}
            aria-live={isError() ? 'assertive' : 'polite'}
            aria-busy={isError() ? undefined : 'true'}
            data-testid={testId()}
            data-state={feedback().kind}
            data-retryable={isRetryable() ? 'true' : 'false'}
            data-dismissible={isDismissible() ? 'true' : 'false'}
          >
            <p class="spreadsheet-feedback-message">{feedback().message}</p>
            <Show when={feedback().detail}>
              <p class="spreadsheet-feedback-detail">{feedback().detail}</p>
            </Show>
            <Show when={isRetryable()}>
              <button
                type="button"
                class="spreadsheet-feedback-retry"
                data-testid="feedback-retry"
                onClick={() => props.onRetry?.()}
              >
                {retryLabel()}
              </button>
            </Show>
            <Show when={isDismissible()}>
              <button
                type="button"
                class="spreadsheet-feedback-dismiss"
                data-testid="feedback-dismiss"
                onClick={() => props.onDismiss?.()}
              >
                {props.dismissLabel ?? 'Dismiss'}
              </button>
            </Show>
          </section>
        )
      }}
    </Show>
  )
}
