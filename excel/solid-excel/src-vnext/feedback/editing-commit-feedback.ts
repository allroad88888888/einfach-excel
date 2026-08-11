import type { EditingCommitLifecycleState } from '@einfach/spreadsheet-ui-core'
import type { SpreadsheetFeedback } from './types'

/**
 * Projects the shared editing-commit lifecycle into feedback copy.
 *
 * The three terminal states below all leave the drafting session OPEN on
 * purpose, so the user can retry or cancel without losing what they typed
 * (`spreadsheet-ui-core/src/editing/index.ts` § `rejectEditingTicket`). That
 * is only humane if the UI says why the editor is still sitting there — an
 * unrendered `outcome-unknown` is indistinguishable from "Enter does nothing",
 * which is exactly how a slow backend used to read as "editing is broken".
 *
 * `pending` deliberately produces no feedback: a commit that resolves in the
 * usual few milliseconds must not flash a spinner on every keystroke. Only the
 * states the user has to act on get a surface.
 */
export function editingCommitFeedback(
  lifecycle: EditingCommitLifecycleState,
): SpreadsheetFeedback | null {
  switch (lifecycle.status) {
    case 'rejected':
      return {
        kind: 'error',
        message: 'That edit was not saved.',
        detail: lifecycle.error || undefined,
      }
    case 'outcome-unknown':
      return {
        kind: 'error',
        // Deliberately not "failed": the backend may well have applied it. The
        // one thing we know is that it never confirmed within the deadline.
        message: 'This edit was not confirmed — it may or may not have been saved.',
        detail: lifecycle.error || undefined,
      }
    case 'refresh-failed':
      return {
        kind: 'error',
        // The write itself was acknowledged; only the re-read failed, so the
        // grid may be showing stale values. Say that, don't cry "not saved".
        message: 'This edit was saved, but the sheet could not be refreshed.',
        detail: lifecycle.error || undefined,
      }
    case 'ready':
    case 'blocked':
    case 'pending':
    case 'local-acknowledged':
    case 'refreshing':
      return null
  }
}

/** Terminal states this surface speaks for — the shared list, not a copy. */
export function isUnresolvedEditingCommit(lifecycle: EditingCommitLifecycleState): boolean {
  return editingCommitFeedback(lifecycle) !== null
}
