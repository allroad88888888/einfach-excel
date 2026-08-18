import type { Setter } from '@einfach/core'
import {
  pushReservedHistoryAtom,
  type HistoryLocalReplayPayload,
  type HistoryRecordResult,
} from '../history'
import type { ExactRemoveRowsAcknowledgement } from './mutation-acknowledgement'
import type { RemoveDuplicatesMutationTicket } from './state'

function normalizeHistoryRecordResult(value: unknown): HistoryRecordResult {
  return value === 'recorded' || value === 'unavailable' || value === 'rejected'
    ? value
    : 'rejected'
}

export function recordRemoveDuplicatesHistory(
  set: Setter,
  ticket: RemoveDuplicatesMutationTicket,
  acknowledgement: ExactRemoveRowsAcknowledgement,
  localSidePayloads: readonly HistoryLocalReplayPayload[],
): HistoryRecordResult {
  if (!acknowledgement.historyRecorded) return 'recorded'
  try {
    return normalizeHistoryRecordResult(
      ticket.historyEntryRecorder(
        {
          transactionId: `remove-duplicates-${ticket.sessionId}-${ticket.target.requestId}`,
          kind: 'row.delete',
          sheetId: ticket.target.sheetId,
          projectionRevision: acknowledgement.revision,
          affectedRange: {
            rowStart: acknowledgement.affectedRange.startRow,
            rowEnd: acknowledgement.affectedRange.endRow,
            colStart: acknowledgement.affectedRange.startCol,
            colEnd: acknowledgement.affectedRange.endCol,
          },
          ...(localSidePayloads.length > 0 ? { localSidePayloads } : {}),
        },
        (entry) => set(pushReservedHistoryAtom, { reservation: ticket.historyReservation, entry }),
      ),
    )
  } catch {
    return 'rejected'
  }
}
