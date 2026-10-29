import type { Setter } from '@einfach/core'
import { pushReservedHistoryAtom } from '../history'
import type { HistoryEntry, HistoryEntryRecorder, HistoryRecordResult } from '../history'
import type { RunStructureOperationInput } from './structure-contract'
import type { StructureOperationTicket } from './structure-lifecycle'

export function captureStructureOperationHistoryEntryRecorder(
  input: RunStructureOperationInput,
): HistoryEntryRecorder | null {
  try {
    const recorder = input.historyEntryRecorder
    return typeof recorder === 'function' ? recorder : null
  } catch {
    return null
  }
}

export function recordStructureOperationHistory(
  set: Setter,
  ticket: StructureOperationTicket,
  entry: HistoryEntry,
): HistoryRecordResult {
  const append = (nextEntry: HistoryEntry): boolean =>
    set(pushReservedHistoryAtom, { reservation: ticket.historyReservation, entry: nextEntry })
  try {
    const result = ticket.historyEntryRecorder(entry, append)
    return result === 'recorded' || result === 'unavailable' || result === 'rejected'
      ? result
      : 'rejected'
  } catch {
    return 'rejected'
  }
}
