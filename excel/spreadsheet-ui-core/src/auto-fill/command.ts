import { atom, type Getter } from '@einfach/core'
import {
  acquireHistoryProducerReservationAtom,
  releaseHistoryProducerReservationAtom,
} from '../history'
import { selectionAuthorityWitnessAtom } from '../selection'
import type { CellRange } from '../shared'
import { workspaceActiveSheetAuthorityWitnessAtom } from '../workspace'
import type {
  AutoFillDirection,
  AutoFillIntent,
  AutoFillOutcome,
  RetryAutoFillRefreshInput,
  RunAutoFillInput,
} from './command-contract'
import { resolveDoubleClickIntent } from './fill-double-click-intent'
import { executeIntent } from './fill-execute-intent'
import { captureAutoFillHistoryEntryRecorder } from './fill-history'
import { copyRange, normalizeRange } from './fill-range-geometry'
import {
  acknowledgedRecovery,
  pendingAutoFillRecoveryAtom,
  recoverAutoFillProjection,
  unknownRecovery,
  type AutoFillPendingRecovery,
} from './fill-recovery'
import {
  activeAutoFillTicketAtom,
  autoFillSequenceAtom,
  blockedAuthorityReason,
  finishTicket,
  ticketAuthorityIsCurrent,
  ticketFilterAllowsMutation,
  ticketIsCurrent,
  ticketMutationContextIsCurrent,
  type AutoFillTicket,
  type MutationSuccess,
  type ProjectionWitness,
} from './fill-ticket'

export * from './command-contract'

function createFillCommandIntent(
  sheetId: string,
  selectionRange: Readonly<CellRange>,
  direction: AutoFillDirection,
): AutoFillIntent {
  const targetRange = normalizeRange(selectionRange)
  let sourceRange: CellRange
  switch (direction) {
    case 'down':
      sourceRange = {
        rowStart: targetRange.rowStart,
        rowEnd: targetRange.rowStart,
        colStart: targetRange.colStart,
        colEnd: targetRange.colEnd,
      }
      break
    case 'up':
      sourceRange = {
        rowStart: targetRange.rowEnd,
        rowEnd: targetRange.rowEnd,
        colStart: targetRange.colStart,
        colEnd: targetRange.colEnd,
      }
      break
    case 'right':
      sourceRange = {
        rowStart: targetRange.rowStart,
        rowEnd: targetRange.rowEnd,
        colStart: targetRange.colStart,
        colEnd: targetRange.colStart,
      }
      break
    case 'left':
      sourceRange = {
        rowStart: targetRange.rowStart,
        rowEnd: targetRange.rowEnd,
        colStart: targetRange.colEnd,
        colEnd: targetRange.colEnd,
      }
      break
  }
  return {
    sheetId,
    sourceRange,
    targetRange,
    direction,
    copyOnly: true,
  }
}

async function refreshSuccess(
  get: Getter,
  ticket: AutoFillTicket,
  input: RunAutoFillInput,
  success: MutationSuccess,
): Promise<AutoFillOutcome> {
  const contextBeforeRefresh =
    success.committedStale !== true && ticketMutationContextIsCurrent(get, ticket)
  try {
    await input.refreshProjection(ticket.sheetId)
  } catch {
    return { status: 'refresh-failed', path: success.path }
  }
  const committedStale = !contextBeforeRefresh || !ticketMutationContextIsCurrent(get, ticket)
  return {
    status: 'completed',
    path: success.path,
    affectedRange: copyRange(success.affectedRange),
    historyEntries: success.historyEntries,
    ...(committedStale ? { committedStale: true as const } : {}),
  }
}

export const runAutoFillAtom = atom(
  null,
  async (get, set, input: RunAutoFillInput): Promise<AutoFillOutcome> => {
    const activeTicket = get(activeAutoFillTicketAtom)
    if (activeTicket !== null) {
      const recovery = get(pendingAutoFillRecoveryAtom)
      if (recovery !== null && recovery.settled === true && recovery.ticket === activeTicket) {
        // This invocation is consumed by refresh-only recovery. It never
        // proceeds to execute the newly supplied intent.
        return recoverAutoFillProjection(get, set, input)
      }
      return { status: 'blocked', reason: 'busy' }
    }
    if (get(pendingAutoFillRecoveryAtom) !== null) {
      return { status: 'blocked', reason: 'busy' }
    }

    const historyEntryRecorder = captureAutoFillHistoryEntryRecorder(input)
    if (historyEntryRecorder === null) {
      return { status: 'blocked', reason: 'busy' }
    }

    const fillCommandIntent =
      input.entrypoint === 'fill-command'
        ? createFillCommandIntent(input.sheetId, input.selectionRange, input.direction)
        : null
    const sheetId = input.entrypoint === 'fill-handle' ? input.intent.sheetId : input.sheetId
    const sourceRange =
      input.entrypoint === 'fill-handle'
        ? input.intent.sourceRange
        : input.entrypoint === 'fill-command'
          ? fillCommandIntent!.sourceRange
          : input.sourceRange
    const authorityRange =
      input.entrypoint === 'fill-command' ? fillCommandIntent!.targetRange : sourceRange
    const historyReservation = set(acquireHistoryProducerReservationAtom)
    if (historyReservation === null) {
      return { status: 'blocked', reason: 'busy' }
    }

    let ownedTicket: AutoFillTicket | null = null
    let pendingRecovery: AutoFillPendingRecovery | null = null
    try {
      const authorityBlock = blockedAuthorityReason(get, sheetId, authorityRange)
      if (authorityBlock) return authorityBlock

      const previousId = get(autoFillSequenceAtom)
      const nextId = previousId < Number.MAX_SAFE_INTEGER ? previousId + 1 : 1
      const ticket: AutoFillTicket = Object.freeze({
        id: nextId,
        sheetId,
        sourceRange: Object.freeze(copyRange(sourceRange)),
        authorityRange: Object.freeze(copyRange(authorityRange)),
        requiresUnfiltered: input.entrypoint === 'double-click',
        selectionWitness: get(selectionAuthorityWitnessAtom),
        workspaceWitness: get(workspaceActiveSheetAuthorityWitnessAtom),
        historyEntryRecorder,
        historyReservation,
      })
      ownedTicket = ticket
      set(autoFillSequenceAtom, nextId)
      set(activeAutoFillTicketAtom, ticket)

      const outcome = await (async (): Promise<AutoFillOutcome> => {
        // Both ownership gates are visible before yielding, so same-tick
        // mutation/history handlers cannot launch competing transports.
        await Promise.resolve()
        if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
          return { status: 'stale' }
        }

        let intent: AutoFillIntent
        let fillRangeWitness: ProjectionWitness | undefined
        if (input.entrypoint === 'double-click') {
          const planned = await resolveDoubleClickIntent(get, ticket, input)
          if ('outcome' in planned) return planned.outcome
          intent = planned.intent
          fillRangeWitness = planned.fillRangeWitness
        } else if (input.entrypoint === 'fill-command') {
          intent = {
            sheetId: fillCommandIntent!.sheetId,
            sourceRange: copyRange(fillCommandIntent!.sourceRange),
            targetRange: copyRange(fillCommandIntent!.targetRange),
            direction: fillCommandIntent!.direction,
            copyOnly: true,
          }
        } else {
          intent = {
            sheetId: input.intent.sheetId,
            sourceRange: copyRange(input.intent.sourceRange),
            targetRange: copyRange(input.intent.targetRange),
            direction: input.intent.direction,
            copyOnly: input.intent.copyOnly,
          }
        }

        if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
          return { status: 'stale' }
        }
        if (!ticketFilterAllowsMutation(get, ticket)) {
          return { status: 'blocked', reason: 'active-filter' }
        }
        const attempted = await executeIntent(
          get,
          set,
          ticket,
          intent,
          input.source,
          fillRangeWitness,
        )
        if (attempted.kind === 'terminal') {
          if (attempted.outcome.status === 'outcome-unknown') {
            pendingRecovery = unknownRecovery(ticket, attempted.outcome)
          }
          return attempted.outcome
        }
        if (attempted.kind === 'not-used') {
          return { status: 'failed', phase: 'read' }
        }
        const refreshed = await refreshSuccess(get, ticket, input, attempted.value)
        if (refreshed.status === 'refresh-failed') {
          pendingRecovery = acknowledgedRecovery(ticket, attempted.value)
        }
        return refreshed
      })()
      if (pendingRecovery !== null) {
        set(pendingAutoFillRecoveryAtom, pendingRecovery)
      }
      return outcome
    } finally {
      if (pendingRecovery === null) {
        if (ownedTicket === null) {
          set(releaseHistoryProducerReservationAtom, historyReservation)
        } else {
          finishTicket(set, get, ownedTicket)
        }
      }
    }
  },
)
runAutoFillAtom.debugLabel = 'spreadsheet.autoFill.run.command'

/** Explicit refresh-only exit for a settled ambiguous or refresh-failed fill. */
export const retryAutoFillRefreshAtom = atom(
  null,
  async (get, set, input: RetryAutoFillRefreshInput): Promise<AutoFillOutcome> =>
    recoverAutoFillProjection(get, set, input),
)
retryAutoFillRefreshAtom.debugLabel = 'spreadsheet.autoFill.retryRefresh'
