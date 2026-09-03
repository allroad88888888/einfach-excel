/** Freezes the exact request, intent, and caller capabilities for one edit. */
import type { HistoryProducerReservation } from '../history'
import type { CellCoord } from '../shared'
import type { CapturedEditingCommitInput } from './commit-input'
import type { EditingCommitTicket } from './commit-state'
import type { EditingCommitIntent } from './types'

export function createEditingCommitTicket(input: {
  readonly sessionId: number
  readonly requestId: number
  readonly derivedIntent: EditingCommitIntent
  readonly targetCell: Readonly<CellCoord>
  readonly captured: Extract<CapturedEditingCommitInput, { readonly kind: 'captured' }>
  readonly historyReservation: HistoryProducerReservation | null
}): EditingCommitTicket {
  const request = Object.freeze({
    kind: 'set-cell-input' as const,
    sheetId: input.derivedIntent.sheetId,
    row: input.targetCell.row,
    col: input.targetCell.col,
    input: input.derivedIntent.input,
    requestId: input.requestId,
  })
  const intent = Object.freeze({
    type: 'editing.commit' as const,
    sheetId: input.derivedIntent.sheetId,
    cell: Object.freeze({ row: input.targetCell.row, col: input.targetCell.col }),
    source: input.derivedIntent.source,
    input: input.derivedIntent.input,
    move: input.derivedIntent.move,
  })
  return Object.freeze({
    sessionId: input.sessionId,
    requestId: input.requestId,
    intent,
    request,
    refreshProjection: input.captured.refreshProjection,
    timeoutMs: input.captured.timeoutMs,
    historyReservation: input.historyReservation,
  })
}
