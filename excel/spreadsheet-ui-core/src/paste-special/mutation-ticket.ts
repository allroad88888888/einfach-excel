import type { ProjectionRequestId, ProjectionRevision } from '../backend/types'
import type { HistoryEntryRecorder, HistoryProducerReservation } from '../history'
import type { CellRange } from '../shared'
import { isValidPasteSpecialRange, snapshotRange } from './session-snapshot'
import type { PasteRangeRequest, PasteRangeResult, PasteSpecialSessionSnapshot } from './types'

export interface PasteSpecialMutationTicket {
  readonly sessionId: number
  readonly requestId: ProjectionRequestId
  readonly sheetId: string
  readonly sessionWitness: PasteSpecialSessionSnapshot
  readonly target: CellRange
  readonly request: PasteRangeRequest
  readonly historyReservation: HistoryProducerReservation
  readonly historyEntryRecorder: HistoryEntryRecorder
  readonly acknowledgement: PasteSpecialAcknowledgement | null
}

export interface PasteSpecialAcknowledgement {
  readonly kind: 'paste-range'
  readonly sheetId: string
  readonly requestId: ProjectionRequestId
  readonly revision: ProjectionRevision
  readonly affectedRange: CellRange
}

export function snapshotPasteSpecialAcknowledgement(
  acknowledgement: unknown,
  ticket: PasteSpecialMutationTicket,
): PasteSpecialAcknowledgement | null {
  try {
    if (typeof acknowledgement !== 'object' || acknowledgement === null) return null
    const result = acknowledgement as Partial<PasteRangeResult>
    const kind = result.kind
    const sheetId = result.sheetId
    const requestId = result.requestId
    const revision = result.revision
    const affectedRange = snapshotRange(result.affectedRange)
    if (
      kind !== 'paste-range' ||
      sheetId !== ticket.sheetId ||
      requestId !== ticket.requestId ||
      !(
        (typeof revision === 'number' && Number.isFinite(revision)) ||
        (typeof revision === 'string' && revision.length > 0)
      ) ||
      !isValidPasteSpecialRange(affectedRange)
    ) {
      return null
    }
    return Object.freeze({
      kind,
      sheetId,
      requestId,
      revision,
      affectedRange,
    })
  } catch {
    return null
  }
}
