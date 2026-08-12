import type { Setter } from '@einfach/core'
import {
  nextHistoryTransactionId,
  pushReservedHistoryAtom,
  type HistoryEntry,
  type HistoryEntryRecorder,
  type HistoryProducerReservation,
  type HistoryRecordResult,
} from '../history'
import type { ProjectionRequestId } from '../backend/types'
import type {
  FilterSortAcknowledgementSnapshot,
  PhysicalSortAcknowledgement,
  PhysicalSortTicket,
} from './internal-types'

export function isValidProjectionRevision(
  value: unknown,
): value is HistoryEntry['projectionRevision'] {
  return (
    (typeof value === 'number' && Number.isFinite(value)) ||
    (typeof value === 'string' && value.length > 0)
  )
}

function snapshotHiddenRowIndices(value: unknown, allowAbsent: boolean): readonly number[] | null {
  if (value === undefined && allowAbsent) return Object.freeze([])
  if (!Array.isArray(value)) return null
  const length = value.length
  const snapshot = new Array<number>(length)
  for (let index = 0; index < length; index += 1) {
    const row = value[index] as unknown
    if (!Number.isSafeInteger(row) || (row as number) < 0) return null
    snapshot[index] = row as number
  }
  return Object.freeze(snapshot)
}

export function classifyFilterSortAcknowledgement(
  value: unknown,
  sheetId: string,
  requestId: ProjectionRequestId,
  options: {
    readonly expectedHistoryRecorded: boolean | null
    readonly allowAbsentHiddenRowIndices: boolean
  },
): FilterSortAcknowledgementSnapshot {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value))
      return Object.freeze({ kind: 'invalid' })
    const result = value as Record<PropertyKey, unknown>
    const acknowledgementSheetId = result.sheetId
    const acknowledgementRequestId = result.requestId
    const historyRecorded = result.historyRecorded
    const revision = result.revision
    if (
      acknowledgementSheetId !== sheetId ||
      acknowledgementRequestId !== requestId ||
      typeof historyRecorded !== 'boolean' ||
      (options.expectedHistoryRecorded !== null &&
        historyRecorded !== options.expectedHistoryRecorded) ||
      !isValidProjectionRevision(revision)
    )
      return Object.freeze({ kind: 'invalid' })
    const hiddenRowIndices = snapshotHiddenRowIndices(
      result.hiddenRowIndices,
      options.allowAbsentHiddenRowIndices,
    )
    return hiddenRowIndices === null
      ? Object.freeze({ kind: 'invalid' })
      : Object.freeze({
          kind: 'matched',
          sheetId: acknowledgementSheetId,
          requestId: acknowledgementRequestId,
          historyRecorded,
          revision,
          hiddenRowIndices,
        })
  } catch {
    return Object.freeze({ kind: 'invalid' })
  }
}

function normalizeHistoryRecordResult(value: unknown): HistoryRecordResult {
  return value === 'recorded' || value === 'unavailable' || value === 'rejected'
    ? value
    : 'rejected'
}

function recordReservedHistory(
  set: Setter,
  recorder: HistoryEntryRecorder,
  reservation: HistoryProducerReservation,
  entry: HistoryEntry,
): HistoryRecordResult {
  try {
    return normalizeHistoryRecordResult(
      recorder(entry, (nextEntry) =>
        set(pushReservedHistoryAtom, { reservation, entry: nextEntry }),
      ),
    )
  } catch {
    return 'rejected'
  }
}

export function recordFilterSortHistory(
  set: Setter,
  acknowledgement: Extract<FilterSortAcknowledgementSnapshot, { readonly kind: 'matched' }>,
  sheetId: string,
  reservation: HistoryProducerReservation,
  recorder: HistoryEntryRecorder,
): HistoryRecordResult {
  if (!acknowledgement.historyRecorded) return 'recorded'
  return recordReservedHistory(set, recorder, reservation, {
    transactionId: nextHistoryTransactionId(),
    kind: 'filter.set',
    sheetId,
    projectionRevision: acknowledgement.revision,
  })
}

export function recordPhysicalSortHistory(
  set: Setter,
  ticket: PhysicalSortTicket,
  acknowledgement: Extract<PhysicalSortAcknowledgement, { readonly kind: 'applied' }>,
): HistoryRecordResult {
  if (acknowledgement.movedRows === 0) return 'recorded'
  return recordReservedHistory(set, ticket.historyEntryRecorder, ticket.historyReservation, {
    transactionId: `range-sort-${ticket.target.sheetId}-${ticket.requestId}`,
    kind: 'range.sort',
    sheetId: ticket.target.sheetId,
    projectionRevision: acknowledgement.revision,
    affectedRange: acknowledgement.affectedRange,
  })
}
