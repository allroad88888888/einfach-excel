/**
 * Refresh-only retry for an already acknowledged edit.
 * It never resends the Rust mutation and keeps the original ticket alive.
 */
import { atom } from '@einfach/core'
import { editingErrorMessage, runBoundedEditingOperation } from './bounded-operation'
import { captureEditingRetryInput } from './commit-input'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingTicketIsCurrent,
  lifecycleForTicket,
} from './commit-state'
import { completeEditingTicket } from './commit-settlement'
import type { EditingCommitOutcome, RetryEditingRefreshInput } from './types'

/** Retries projection refresh for one acknowledged editing ticket. */
export const retryEditingRefreshAtom = atom(
  null,
  async (get, set, input: RetryEditingRefreshInput): Promise<EditingCommitOutcome> => {
    const ticket = get(activeEditingCommitTicketAtom)
    const lifecycle = get(editingCommitLifecycleBackingAtom)
    if (
      ticket === null ||
      lifecycle.status !== 'refresh-failed' ||
      lifecycle.acknowledgedRevision === null ||
      !editingTicketIsCurrent(get, ticket, lifecycle)
    ) {
      return 'blocked'
    }
    const revision = lifecycle.acknowledgedRevision
    // Snapshot the failed ticket before reading caller input, whose getters may re-enter Core.
    const captured = captureEditingRetryInput(input)
    if (!editingTicketIsCurrent(get, ticket, lifecycle)) return 'blocked'
    if (captured.kind === 'invalid') return 'blocked'

    const attempt = Object.freeze({
      ticket,
      lifecycle,
      revision,
      refreshProjection: captured.refreshProjection,
      timeoutMs: captured.timeoutMs,
    })
    const refreshingLifecycle = lifecycleForTicket('refreshing', ticket, revision)
    set(editingCommitLifecycleBackingAtom, refreshingLifecycle)

    const refreshResult = await runBoundedEditingOperation(
      () => attempt.refreshProjection(attempt.ticket.request.sheetId),
      attempt.timeoutMs,
    )
    if (!editingTicketIsCurrent(get, ticket, refreshingLifecycle)) return 'blocked'
    if (refreshResult.kind === 'timeout') {
      // Keep the acknowledged ticket intact so another refresh-only retry remains possible.
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'refresh-failed',
          ticket,
          revision,
          'Editing mutation was acknowledged, but projection refresh retry timed out.',
        ),
      )
      return 'refresh-failed'
    }
    if (refreshResult.kind === 'rejected') {
      const detail = editingErrorMessage(refreshResult.error)
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleForTicket(
          'refresh-failed',
          ticket,
          revision,
          `Editing mutation was acknowledged, but refresh retry failed: ${detail}`,
        ),
      )
      return 'refresh-failed'
    }

    return completeEditingTicket(get, set, ticket, refreshingLifecycle)
  },
)
retryEditingRefreshAtom.debugLabel = 'spreadsheet.editing.retryRefresh'
