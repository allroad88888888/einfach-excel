import { atom, type Getter, type Setter } from '@einfach/core'
import type { AutoFillOutcome, RetryAutoFillRefreshInput } from './command-contract'
import { copyRange } from './fill-range-geometry'
import {
  activeAutoFillTicketAtom,
  finishTicket,
  ticketMutationContextIsCurrent,
  type AutoFillTicket,
  type MutationSuccess,
} from './fill-ticket'

export type AutoFillPendingRecovery =
  | {
      readonly kind: 'acknowledged'
      readonly settled: true
      readonly ticket: AutoFillTicket
      readonly success: MutationSuccess
    }
  | {
      readonly kind: 'outcome-unknown'
      readonly settled: true
      readonly ticket: AutoFillTicket
      readonly outcome: Extract<AutoFillOutcome, { status: 'outcome-unknown' }>
    }

/**
 * Exists only after the original transport promise settled. Recovery therefore
 * owns refresh/reconciliation exclusively and can never resend that mutation.
 */
export const pendingAutoFillRecoveryAtom = atom<AutoFillPendingRecovery | null>(null)
pendingAutoFillRecoveryAtom.debugLabel = 'spreadsheet.autoFill.internal.pendingRecovery'

export const activeAutoFillRecoveryAtom = atom<AutoFillPendingRecovery | null>(null)
activeAutoFillRecoveryAtom.debugLabel = 'spreadsheet.autoFill.internal.activeRecovery'

export function snapshotMutationSuccess(success: MutationSuccess): MutationSuccess {
  return Object.freeze({
    path: success.path,
    affectedRange: Object.freeze(copyRange(success.affectedRange)),
    historyEntries: success.historyEntries,
    ...(success.committedStale === true ? { committedStale: true } : {}),
  })
}

export function acknowledgedRecovery(
  ticket: AutoFillTicket,
  success: MutationSuccess,
): AutoFillPendingRecovery {
  return Object.freeze({
    kind: 'acknowledged',
    settled: true,
    ticket,
    success: snapshotMutationSuccess(success),
  })
}

export function unknownRecovery(
  ticket: AutoFillTicket,
  outcome: Extract<AutoFillOutcome, { status: 'outcome-unknown' }>,
): AutoFillPendingRecovery {
  return Object.freeze({
    kind: 'outcome-unknown',
    settled: true,
    ticket,
    outcome: Object.freeze({ ...outcome }),
  })
}

export function recoveryIsCurrent(get: Getter, recovery: AutoFillPendingRecovery): boolean {
  return (
    recovery.settled === true &&
    get(activeAutoFillTicketAtom) === recovery.ticket &&
    get(pendingAutoFillRecoveryAtom) === recovery &&
    get(activeAutoFillRecoveryAtom) === recovery
  )
}

/**
 * Reconciliation is deliberately refresh-only. A pending recovery can only be
 * created after the original transport settled, and this function has no
 * mutation port, so neither the old mutation nor a newly supplied intent can
 * be sent while the projection is ambiguous.
 */
export async function recoverAutoFillProjection(
  get: Getter,
  set: Setter,
  input: RetryAutoFillRefreshInput,
): Promise<AutoFillOutcome> {
  if (typeof input.refreshProjection !== 'function') {
    return { status: 'blocked', reason: 'busy' }
  }
  const ticket = get(activeAutoFillTicketAtom)
  const recovery = get(pendingAutoFillRecoveryAtom)
  if (
    ticket === null ||
    recovery === null ||
    recovery.settled !== true ||
    recovery.ticket !== ticket ||
    get(activeAutoFillRecoveryAtom) !== null
  ) {
    return { status: 'blocked', reason: 'busy' }
  }

  set(activeAutoFillRecoveryAtom, recovery)
  try {
    // Make the synchronously reserved lane observable to duplicate handlers.
    await Promise.resolve()
    if (!recoveryIsCurrent(get, recovery)) {
      return { status: 'blocked', reason: 'busy' }
    }

    const contextBeforeRefresh =
      recovery.kind === 'acknowledged' &&
      recovery.success.committedStale !== true &&
      ticketMutationContextIsCurrent(get, ticket)
    try {
      await input.refreshProjection(ticket.sheetId)
    } catch {
      if (!recoveryIsCurrent(get, recovery)) {
        return { status: 'blocked', reason: 'busy' }
      }
      return recovery.kind === 'acknowledged'
        ? { status: 'refresh-failed', path: recovery.success.path }
        : recovery.outcome
    }

    if (!recoveryIsCurrent(get, recovery)) {
      return { status: 'blocked', reason: 'busy' }
    }
    const contextAfterRefresh = ticketMutationContextIsCurrent(get, ticket)
    if (recovery.kind === 'outcome-unknown') {
      // Refresh is observational only for ambiguous commits. It may update the
      // projection, but it can never reconcile the mutation or release either
      // ownership gate.
      return recovery.outcome
    }
    const committedStale = !contextBeforeRefresh || !contextAfterRefresh
    if (!finishTicket(set, get, ticket)) {
      const outcome = Object.freeze({
        status: 'outcome-unknown' as const,
        path: recovery.success.path,
        reason: 'history-rejected' as const,
      })
      set(pendingAutoFillRecoveryAtom, unknownRecovery(ticket, outcome))
      return outcome
    }
    set(pendingAutoFillRecoveryAtom, null)
    return {
      status: 'completed',
      path: recovery.success.path,
      affectedRange: copyRange(recovery.success.affectedRange),
      historyEntries: recovery.success.historyEntries,
      ...(committedStale ? { committedStale: true as const } : {}),
    }
  } finally {
    if (get(activeAutoFillRecoveryAtom) === recovery) {
      set(activeAutoFillRecoveryAtom, null)
    }
  }
}
