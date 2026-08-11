import type { Accessor } from 'solid-js'

/**
 * The current, user-visible result of one command-backed feature.
 *
 * This deliberately has only two states. Success belongs in the feature's
 * normal UI and durable diagnostics belong in `diagnosticsAtom`; this surface
 * only explains work in progress and a failure the user can immediately retry.
 */
export type SpreadsheetFeedback =
  | {
      readonly kind: 'loading'
      readonly message: string
      readonly detail?: string
    }
  | {
      readonly kind: 'error'
      readonly message: string
      readonly detail?: string
      readonly retryLabel?: string
    }

/**
 * Presentation inputs stay outside of command state: `feedback` is an atom
 * accessor and the retry callback remains owned by the command's caller.
 */
export interface SpreadsheetFeedbackSurfaceProps {
  readonly feedback: Accessor<SpreadsheetFeedback | null>
  readonly onRetry?: () => void
  readonly retryLabel?: string
  readonly class?: string
  readonly 'data-testid'?: string
}
