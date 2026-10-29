import type { Getter, Setter } from '@einfach/core'
import { resolveContentMutationAtom } from '../editing/mutation-gateway'
import { getFillHandleWriteRange } from '../pointer'
import type { AutoFillControllerPort, AutoFillIntent } from './command-contract'
import { classifyCompactAutoFillAcknowledgement } from './fill-acknowledgement'
import { runFallback } from './fill-fallback-attempt'
import { pushCompactHistory } from './fill-history'
import { copyRange } from './fill-range-geometry'
import { trySeries } from './fill-series-attempt'
import {
  ticketAuthorityIsCurrent,
  ticketFilterAllowsMutation,
  ticketIsCurrent,
  ticketMutationContextIsCurrent,
  type AutoFillTicket,
  type MutationAttempt,
  type ProjectionWitness,
} from './fill-ticket'

export async function executeIntent(
  get: Getter,
  set: Setter,
  ticket: AutoFillTicket,
  intent: AutoFillIntent,
  source: AutoFillControllerPort,
  planningWitness?: ProjectionWitness,
): Promise<MutationAttempt> {
  const writeRange = getFillHandleWriteRange(
    intent.sourceRange,
    intent.targetRange,
    intent.direction,
  )
  if (writeRange === null) {
    return { kind: 'terminal', outcome: { status: 'no-op', reason: 'no-write-range' } }
  }
  if (!ticketFilterAllowsMutation(get, ticket)) {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: 'active-filter' },
    }
  }

  const writeResolution = set(resolveContentMutationAtom, {
    kind: 'fill-range',
    sheetId: intent.sheetId,
    range: writeRange,
  })
  if (writeResolution.status === 'blocked') {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: writeResolution.reason },
    }
  }
  const sourceResolution = set(resolveContentMutationAtom, {
    kind: 'fill-range',
    sheetId: intent.sheetId,
    range: intent.sourceRange,
    protectionGate: false,
  })
  if (sourceResolution.status === 'blocked') {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: sourceResolution.reason },
    }
  }

  const series = await trySeries(get, set, ticket, intent, writeRange, source, planningWitness)
  if (series.kind !== 'not-used') return series
  if (
    planningWitness &&
    series.fillRangeWitness &&
    planningWitness.revision !== series.fillRangeWitness.revision
  ) {
    return { kind: 'terminal', outcome: { status: 'stale' } }
  }
  const fillRangeWitness = planningWitness ?? series.fillRangeWitness

  if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
    return { kind: 'terminal', outcome: { status: 'stale' } }
  }
  if (source.fillRange) {
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return {
        kind: 'terminal',
        outcome: { status: 'blocked', reason: 'active-filter' },
      }
    }
    let result: unknown
    try {
      result = await source.fillRange({
        kind: 'fill-range',
        sheetId: intent.sheetId,
        sourceRange: copyRange(intent.sourceRange),
        targetRange: copyRange(intent.targetRange),
        direction: intent.direction,
        ...(fillRangeWitness
          ? {
              requestId: fillRangeWitness.requestId,
              revision: fillRangeWitness.revision,
            }
          : {}),
      })
    } catch {
      const committedStale = !ticketMutationContextIsCurrent(get, ticket)
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'fill-range',
          reason: committedStale ? 'committed-stale' : 'transport-rejected',
        },
      }
    }
    const authorityCurrent = ticketMutationContextIsCurrent(get, ticket)
    const acknowledgement = classifyCompactAutoFillAcknowledgement(
      result,
      intent.sheetId,
      writeRange,
    )
    if (acknowledgement.kind === 'invalid') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'fill-range',
          reason: 'invalid-acknowledgement',
        },
      }
    }
    if (acknowledgement.kind === 'no-op') {
      return authorityCurrent
        ? { kind: 'terminal', outcome: { status: 'no-op', reason: 'backend-no-op' } }
        : { kind: 'terminal', outcome: { status: 'stale' } }
    }
    const historyResult = pushCompactHistory(
      set,
      ticket,
      intent.sheetId,
      acknowledgement.result,
      acknowledgement.revision,
    )
    if (historyResult === 'rejected') {
      return {
        kind: 'terminal',
        outcome: {
          status: 'outcome-unknown',
          path: 'fill-range',
          reason: 'history-rejected',
        },
      }
    }
    return {
      kind: 'success',
      value: {
        path: 'fill-range',
        affectedRange: copyRange(acknowledgement.result.affectedRange!),
        historyEntries: historyResult === 'recorded' ? 1 : 0,
        committedStale: !authorityCurrent,
      },
    }
  }
  return runFallback(get, set, ticket, intent, writeRange, source)
}
