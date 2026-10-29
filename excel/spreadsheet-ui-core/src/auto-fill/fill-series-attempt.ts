import type { Getter, Setter } from '@einfach/core'
import type { RangeProjectionResult } from '../backend/types'
import type { CellRange } from '../shared'
import type { AutoFillControllerPort, AutoFillIntent } from './command-contract'
import { detectFillSeries, fillSeriesLocaleAtom } from './detector'
import { classifyCompactAutoFillAcknowledgement, revisionForHistory } from './fill-acknowledgement'
import { pushCompactHistory } from './fill-history'
import { copyRange } from './fill-range-geometry'
import { isExactProjection, orderedSeriesCells } from './fill-source-projection'
import {
  ticketAuthorityIsCurrent,
  ticketFilterAllowsMutation,
  ticketIsCurrent,
  ticketMutationContextIsCurrent,
  type AutoFillTicket,
  type MutationAttempt,
  type ProjectionWitness,
} from './fill-ticket'
import type { FillSeriesDetectionResult } from './types'

export function isBoundedSeriesSource(
  sourceRange: Readonly<CellRange>,
  direction: AutoFillIntent['direction'],
): boolean {
  if (direction === 'down' || direction === 'up') {
    return sourceRange.colStart === sourceRange.colEnd
  }
  return sourceRange.rowStart === sourceRange.rowEnd
}

export function isExecutableSeries(
  detected: FillSeriesDetectionResult,
): detected is FillSeriesDetectionResult & { step: number } {
  if (
    detected.kind === 'copy' ||
    typeof detected.step !== 'number' ||
    !Number.isFinite(detected.step) ||
    detected.step === 0
  ) {
    return false
  }
  if (detected.kind === 'text-number' && detected.textPattern === undefined) return false
  if (
    (detected.kind === 'weekday-name' ||
      detected.kind === 'month-name' ||
      detected.kind === 'custom-list') &&
    detected.list === undefined
  ) {
    return false
  }
  return true
}

export async function trySeries(
  get: Getter,
  set: Setter,
  ticket: AutoFillTicket,
  intent: AutoFillIntent,
  writeRange: Readonly<CellRange>,
  source: AutoFillControllerPort,
  planningWitness?: ProjectionWitness,
): Promise<MutationAttempt> {
  if (
    intent.copyOnly ||
    !source.fillSeries ||
    !isBoundedSeriesSource(intent.sourceRange, intent.direction)
  ) {
    return { kind: 'not-used' }
  }

  let projection: RangeProjectionResult | null
  try {
    projection = await source.readRangeProjection(intent.sheetId, intent.sourceRange)
  } catch {
    if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
      return { kind: 'terminal', outcome: { status: 'stale' } }
    }
    if (!ticketFilterAllowsMutation(get, ticket)) {
      return {
        kind: 'terminal',
        outcome: { status: 'blocked', reason: 'active-filter' },
      }
    }
    return { kind: 'terminal', outcome: { status: 'failed', phase: 'read' } }
  }
  if (!ticketIsCurrent(get, ticket) || !ticketAuthorityIsCurrent(get, ticket)) {
    return { kind: 'terminal', outcome: { status: 'stale' } }
  }
  if (!ticketFilterAllowsMutation(get, ticket)) {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: 'active-filter' },
    }
  }
  if (projection === null || !isExactProjection(projection, intent.sheetId, intent.sourceRange)) {
    return { kind: 'not-used' }
  }
  const projectionRevision = revisionForHistory(projection.revision)
  if (projectionRevision === null) return { kind: 'not-used' }
  if (planningWitness && planningWitness.revision !== projectionRevision) {
    return { kind: 'terminal', outcome: { status: 'stale' } }
  }
  const cells = orderedSeriesCells(projection, intent.sourceRange, intent.direction)
  if (cells === null) return { kind: 'not-used' }

  const detected = detectFillSeries(cells, get(fillSeriesLocaleAtom))
  if (!isExecutableSeries(detected)) {
    return {
      kind: 'not-used',
      fillRangeWitness: {
        requestId: projection.requestId,
        revision: projectionRevision,
      },
    }
  }
  if (!ticketFilterAllowsMutation(get, ticket)) {
    return {
      kind: 'terminal',
      outcome: { status: 'blocked', reason: 'active-filter' },
    }
  }

  let result: unknown
  try {
    result = await source.fillSeries({
      kind: 'fill-series',
      sheetId: intent.sheetId,
      sourceRange: copyRange(intent.sourceRange),
      targetRange: copyRange(intent.targetRange),
      direction: intent.direction,
      series: detected.kind,
      step: detected.step,
      ...(detected.textPattern ? { textPattern: { ...detected.textPattern } } : {}),
      ...(detected.list
        ? {
            list: {
              listName: detected.list.listName,
              values: [...detected.list.values],
              locale: detected.list.locale,
            },
          }
        : {}),
      requestId: projection.requestId,
      revision: projectionRevision,
    })
  } catch {
    const committedStale = !ticketMutationContextIsCurrent(get, ticket)
    return {
      kind: 'terminal',
      outcome: {
        status: 'outcome-unknown',
        path: 'fill-series',
        reason: committedStale ? 'committed-stale' : 'transport-rejected',
      },
    }
  }
  const authorityCurrent = ticketMutationContextIsCurrent(get, ticket)
  const acknowledgement = classifyCompactAutoFillAcknowledgement(result, intent.sheetId, writeRange)
  if (acknowledgement.kind === 'invalid') {
    return {
      kind: 'terminal',
      outcome: {
        status: 'outcome-unknown',
        path: 'fill-series',
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
        path: 'fill-series',
        reason: 'history-rejected',
      },
    }
  }
  return {
    kind: 'success',
    value: {
      path: 'fill-series',
      affectedRange: copyRange(acknowledgement.result.affectedRange!),
      historyEntries: historyResult === 'recorded' ? 1 : 0,
      committedStale: !authorityCurrent,
    },
  }
}
