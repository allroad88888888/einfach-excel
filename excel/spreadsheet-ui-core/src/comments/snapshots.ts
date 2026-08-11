import { COMMENT_ID_MAX } from './constants'
import type { CommentMutationInputSnapshot, CommentMutationTicket } from './internal-types'
import { isObjectLike, isObjectRecord } from './primitives'
import type {
  CommentMutationAcknowledgement,
  CommentMutationPortSource,
  CommentSessionState,
} from './types'

export function snapshotSession(value: unknown): CommentSessionState | null {
  if (!isObjectRecord(value)) return null
  try {
    const sheetId = value.sheetId
    const cellValue = value.cell
    const threadId = value.threadId
    if (
      typeof sheetId !== 'string' ||
      sheetId.length === 0 ||
      sheetId.length > COMMENT_ID_MAX ||
      !isObjectRecord(cellValue)
    ) {
      return null
    }
    const row = cellValue.row
    const col = cellValue.col
    if (
      typeof row !== 'number' ||
      !Number.isSafeInteger(row) ||
      row < 0 ||
      typeof col !== 'number' ||
      !Number.isSafeInteger(col) ||
      col < 0 ||
      (threadId !== undefined &&
        (typeof threadId !== 'string' || threadId.length === 0 || threadId.length > COMMENT_ID_MAX))
    ) {
      return null
    }
    return { sheetId, cell: { row, col }, threadId: threadId as string | undefined }
  } catch {
    return null
  }
}

export function snapshotMutationInput(value: unknown): CommentMutationInputSnapshot | null {
  if (!isObjectRecord(value)) return null
  try {
    const action = value.action
    const sourceValue = value.source
    if (action !== 'post' && action !== 'resolve') return null
    if (sourceValue === undefined) {
      return Object.freeze({ action, receiver: null, execute: undefined })
    }
    if (!isObjectLike(sourceValue)) return null
    const execute = action === 'post' ? sourceValue.postComment : sourceValue.resolveCommentThread
    if (execute !== undefined && typeof execute !== 'function') return null
    return Object.freeze({
      action,
      receiver: sourceValue as unknown as CommentMutationPortSource,
      execute: execute as CommentMutationInputSnapshot['execute'],
    })
  } catch {
    return null
  }
}

function snapshotAffectedRange(
  value: unknown,
  cell: Readonly<{ row: number; col: number }>,
): CommentMutationAcknowledgement['affectedRange'] | null {
  if (!isObjectRecord(value)) return null
  try {
    const rowStart = value.rowStart
    const rowEnd = value.rowEnd
    const colStart = value.colStart
    const colEnd = value.colEnd
    if (
      typeof rowStart !== 'number' ||
      !Number.isSafeInteger(rowStart) ||
      typeof rowEnd !== 'number' ||
      !Number.isSafeInteger(rowEnd) ||
      typeof colStart !== 'number' ||
      !Number.isSafeInteger(colStart) ||
      typeof colEnd !== 'number' ||
      !Number.isSafeInteger(colEnd) ||
      rowStart !== cell.row ||
      rowEnd !== cell.row ||
      colStart !== cell.col ||
      colEnd !== cell.col
    ) {
      return null
    }
    return Object.freeze({ rowStart, rowEnd, colStart, colEnd })
  } catch {
    return null
  }
}

export function snapshotAcknowledgement(
  value: unknown,
  ticket: CommentMutationTicket,
): { acknowledgement: CommentMutationAcknowledgement | null; error: string | null } {
  if (!isObjectRecord(value)) {
    return { acknowledgement: null, error: 'Comment acknowledgement must be an object' }
  }
  try {
    const { sheetId, requestId, revision, affectedRange: affectedRangeValue } = value
    if (typeof sheetId !== 'string' || sheetId !== ticket.sheetId) {
      return { acknowledgement: null, error: 'Comment acknowledgement targeted a different sheet' }
    }
    if (
      typeof requestId !== 'number' ||
      !Number.isSafeInteger(requestId) ||
      requestId !== ticket.requestId
    ) {
      return {
        acknowledgement: null,
        error: 'Comment acknowledgement returned a missing, unsafe, or different request id',
      }
    }
    if (
      revision !== undefined &&
      typeof revision !== 'string' &&
      (typeof revision !== 'number' || !Number.isFinite(revision))
    ) {
      return {
        acknowledgement: null,
        error: 'Comment acknowledgement returned an invalid revision',
      }
    }
    let affectedRange: CommentMutationAcknowledgement['affectedRange']
    if (affectedRangeValue !== undefined) {
      const range = snapshotAffectedRange(affectedRangeValue, ticket.cell)
      if (range === null) {
        return { acknowledgement: null, error: 'Comment acknowledgement targeted a different cell' }
      }
      affectedRange = range
    }
    return {
      acknowledgement: Object.freeze({
        sheetId,
        requestId,
        ...(revision === undefined ? {} : { revision }),
        ...(affectedRange === undefined ? {} : { affectedRange }),
      }),
      error: null,
    }
  } catch {
    return { acknowledgement: null, error: 'Comment acknowledgement could not be read safely' }
  }
}
