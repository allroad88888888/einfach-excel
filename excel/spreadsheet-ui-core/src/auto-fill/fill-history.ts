import type { Setter } from '@einfach/core'
import type { AutoFillMutationResult, ProjectionRevision } from '../backend/types'
import {
  nextHistoryTransactionId,
  pushReservedHistoryAtom,
  type HistoryEntry,
  type HistoryEntryRecorder,
  type HistoryRecordResult,
} from '../history'
import type { RunAutoFillInput } from './command-contract'
import { copyRange } from './fill-range-geometry'
import type { AutoFillTicket } from './fill-ticket'

export function captureAutoFillHistoryEntryRecorder(
  input: RunAutoFillInput,
): HistoryEntryRecorder | null {
  try {
    const recorder = input.historyEntryRecorder
    return typeof recorder === 'function' ? recorder : null
  } catch {
    return null
  }
}

export function recordAutoFillHistory(
  set: Setter,
  ticket: AutoFillTicket,
  entry: HistoryEntry,
): HistoryRecordResult {
  const append = (nextEntry: HistoryEntry): boolean =>
    set(pushReservedHistoryAtom, {
      reservation: ticket.historyReservation,
      entry: nextEntry,
    })
  try {
    const result = ticket.historyEntryRecorder(entry, append)
    return result === 'recorded' || result === 'unavailable' || result === 'rejected'
      ? result
      : 'rejected'
  } catch {
    return 'rejected'
  }
}

export function pushCompactHistory(
  set: Setter,
  ticket: AutoFillTicket,
  sheetId: string,
  result: Extract<AutoFillMutationResult, { readonly applied: true }>,
  revision: ProjectionRevision,
): HistoryRecordResult {
  return recordAutoFillHistory(set, ticket, {
    transactionId: nextHistoryTransactionId(),
    kind: 'range.fill',
    sheetId,
    projectionRevision: revision,
    affectedRange: copyRange(result.affectedRange),
  })
}
