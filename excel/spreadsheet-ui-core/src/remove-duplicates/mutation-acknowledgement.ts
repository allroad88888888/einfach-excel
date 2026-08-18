import { sameRange, validRevision } from './domain'
import { sameNumberList, snapshotCellRangeValue } from './mutation-target'
import type { RemoveDuplicatesMutationTicket } from './state'
import type { RemoveRowsExactResult } from './types'

export type ExactRemoveRowsAcknowledgement = Omit<RemoveRowsExactResult, 'affectedRange'> & {
  readonly affectedRange: NonNullable<RemoveRowsExactResult['affectedRange']>
  readonly historyRecorded: boolean
}

function snapshotRemovedRows(value: unknown): readonly number[] | null {
  try {
    if (!Array.isArray(value)) return null
    const length = value.length
    if (!Number.isSafeInteger(length) || length < 0) return null
    const rows: number[] = []
    let previous = -1
    for (let index = 0; index < length; index += 1) {
      const row = value[index]
      if (!Number.isSafeInteger(row) || row < 0 || row <= previous) return null
      rows.push(row)
      previous = row
    }
    return Object.freeze(rows)
  } catch {
    return null
  }
}

function snapshotAffectedRangeValue(value: unknown): RemoveRowsExactResult['affectedRange'] {
  try {
    if (typeof value !== 'object' || value === null) return null
    const range = value as NonNullable<RemoveRowsExactResult['affectedRange']>
    const startRow = range.startRow
    const endRow = range.endRow
    const startCol = range.startCol
    const endCol = range.endCol
    if (
      !Number.isSafeInteger(startRow) ||
      !Number.isSafeInteger(endRow) ||
      !Number.isSafeInteger(startCol) ||
      !Number.isSafeInteger(endCol) ||
      startRow < 0 ||
      startCol < 0 ||
      startRow > endRow ||
      startCol > endCol
    )
      return null
    return Object.freeze({ startRow, endRow, startCol, endCol })
  } catch {
    return null
  }
}

export function snapshotAcknowledgement(
  acknowledgement: unknown,
  ticket: RemoveDuplicatesMutationTicket,
): ExactRemoveRowsAcknowledgement | null {
  try {
    if (typeof acknowledgement !== 'object' || acknowledgement === null) return null
    const result = acknowledgement as RemoveRowsExactResult
    const requestId = result.requestId
    const sheetId = result.sheetId
    const targetRangeValue = result.targetRange
    const removedRowIndicesValue = result.removedRowIndices
    const removedRows = result.removedRows
    const affectedRangeValue = result.affectedRange
    const revision = result.revision
    const historyRecordedValue = result.historyRecorded
    const targetRange = snapshotCellRangeValue(targetRangeValue)
    const rows = snapshotRemovedRows(removedRowIndicesValue)
    const affectedRange = snapshotAffectedRangeValue(affectedRangeValue)
    if (
      requestId !== ticket.target.requestId ||
      sheetId !== ticket.target.sheetId ||
      targetRange === null ||
      !sameRange(targetRange, ticket.target.targetRange) ||
      rows === null ||
      !sameNumberList(rows, ticket.target.removedRowIndices) ||
      removedRows !== rows.length ||
      affectedRange === null ||
      !validRevision(revision) ||
      (historyRecordedValue !== undefined && typeof historyRecordedValue !== 'boolean') ||
      Object.is(revision, ticket.target.projectionRevision)
    )
      return null
    if (
      rows.length === 0 ||
      affectedRange.startRow !== rows[0] ||
      affectedRange.endRow !== ticket.target.targetRange.rowEnd ||
      affectedRange.startCol !== ticket.target.targetRange.colStart ||
      affectedRange.endCol !== ticket.target.targetRange.colEnd
    )
      return null
    return Object.freeze({
      requestId,
      sheetId,
      targetRange,
      removedRowIndices: rows,
      removedRows,
      affectedRange,
      revision,
      historyRecorded: historyRecordedValue ?? true,
    })
  } catch {
    return null
  }
}
