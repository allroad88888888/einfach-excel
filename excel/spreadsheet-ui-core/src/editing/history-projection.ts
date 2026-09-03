/** Keeps the UI history cursor aligned with Rust-owned undo records. */
import type { Setter } from '@einfach/core'
import {
  acquireHistoryProducerReservationAtom,
  nextHistoryTransactionId,
  pushReservedHistoryAtom,
  releaseHistoryProducerReservationAtom,
  type HistoryProducerReservation,
} from '../history'
import type { EditingCommitTicket } from './commit-state'
import type { EditingCommitAcknowledgement } from './types'

/** Undefined means the backend has no replay ports; null means the UI lane is busy. */
export function acquireEditingHistoryProjection(
  set: Setter,
  supportsHistoryReplay: boolean,
): HistoryProducerReservation | null | undefined {
  return supportsHistoryReplay ? set(acquireHistoryProducerReservationAtom) : undefined
}

/** Appends metadata only; cell before/after images remain exclusively in Rust. */
export function recordEditingHistoryProjection(
  set: Setter,
  ticket: EditingCommitTicket,
  acknowledgement: EditingCommitAcknowledgement,
): boolean {
  if (ticket.historyReservation === null) return true
  const affectedRange =
    acknowledgement.affectedRange ??
    Object.freeze({
      rowStart: ticket.request.row,
      rowEnd: ticket.request.row,
      colStart: ticket.request.col,
      colEnd: ticket.request.col,
    })
  return set(pushReservedHistoryAtom, {
    reservation: ticket.historyReservation,
    entry: Object.freeze({
      transactionId: nextHistoryTransactionId('edit'),
      kind: 'cell.set-input',
      sheetId: ticket.request.sheetId,
      projectionRevision: acknowledgement.revision,
      affectedRange,
    }),
  })
}

export function releaseEditingHistoryProjection(
  set: Setter,
  reservation: HistoryProducerReservation | null,
): boolean {
  return reservation === null || set(releaseHistoryProducerReservationAtom, reservation)
}
