import type { Store } from '@einfach/core'
import { reportProjectionErrorAtom, type SpreadsheetError } from '@einfach/spreadsheet-ui-core'

/** Used when the rejected value carries no readable message of its own. */
export const COMMAND_FAILURE_FALLBACK_MESSAGE = 'Spreadsheet command failed.'

/**
 * Report a spreadsheet command whose backend transport rejected.
 *
 * Why this exists: every mutation port may REJECT, not just resolve with a
 * failure-shaped ACK. `setCellInput` in particular now rides the engine's
 * fallible `try*` bindings, so an engine refusal arrives as an Error whose
 * own `code` is `CELL_WRITE_REJECTED` and whose `detail` carries the reason
 * (see `adapter/cell-write-reject.ts`). A command entry point that only
 * `await`s such a port converts that refusal into an unhandled promise
 * rejection — the failure is neither swallowed nor reported, which is worse
 * than either.
 *
 * Deliberately reason-agnostic: `reportProjectionErrorAtom` lifts the
 * thrown value's own `code` and `message` verbatim, so the `code` passed
 * here is only the fallback for errors that carry none. Reject reasons may
 * be added or retired engine-side (ADR 0006 retired `spill-write`) without
 * touching this module or any of its callers.
 *
 * Where it lands: the projection snapshot flips to `status: 'error'` with
 * this error attached, which `SpreadsheetStatusBar` renders as text. The
 * snapshot's `result` is preserved, so the grid keeps painting the cells it
 * already has and the sheet stays usable. This is the host's only generic
 * "an operation failed" surface today — there is no toast/notification
 * channel, and `diagnosticsAtom` (UI core's bounded diagnostics list) is
 * written by the mutation gateway but rendered by nothing.
 *
 * Returns the normalized error so a caller can also park it on a
 * feature-local channel (e.g. `setClipboardErrorAtom`) without inventing a
 * second message.
 */
export function reportCommandFailure(
  store: Store,
  error: unknown,
  fallbackMessage: string = COMMAND_FAILURE_FALLBACK_MESSAGE,
): SpreadsheetError {
  return store.setter(reportProjectionErrorAtom, {
    error,
    fallbackMessage,
    code: 'BACKEND_ERROR',
  })
}
