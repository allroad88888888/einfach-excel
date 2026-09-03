/**
 * Captures caller-owned commit ports before the async transaction starts.
 * Getters are treated as untrusted because reading one may synchronously re-enter Core.
 */
import type { ProjectionRevision } from '../backend/types'
import { normalizeEditingTimeout } from './bounded-operation'
import type { EditingCommitTicket } from './commit-state'
import type {
  EditingCommitAcknowledgement,
  EditingCommitMove,
  EditingInputSource,
  RetryEditingRefreshInput,
  RunEditingCommitInput,
} from './types'

export type CapturedEditingCommitInput =
  | {
      readonly kind: 'captured'
      readonly commitSource: EditingInputSource | undefined
      readonly move: EditingCommitMove | undefined
      readonly refreshProjection: RunEditingCommitInput['refreshProjection']
      readonly timeoutMs: number
    }
  | { readonly kind: 'invalid' }

export type CapturedEditingRetryInput =
  | {
      readonly kind: 'captured'
      readonly refreshProjection: RetryEditingRefreshInput['refreshProjection']
      readonly timeoutMs: number
    }
  | { readonly kind: 'invalid' }

function isEditingInputSource(value: unknown): value is EditingInputSource {
  return value === 'cell' || value === 'formula-bar' || value === 'keyboard' || value === 'paste'
}

function isEditingCommitMove(value: unknown): value is EditingCommitMove {
  return (
    value === 'none' || value === 'up' || value === 'down' || value === 'left' || value === 'right'
  )
}

export function captureEditingCommitInput(
  input: RunEditingCommitInput,
): CapturedEditingCommitInput {
  try {
    const commitSource = input.commitSource
    const move = input.move
    const refreshProjection = input.refreshProjection
    const timeoutMs = normalizeEditingTimeout(input.timeoutMs)
    if (
      (commitSource !== undefined && !isEditingInputSource(commitSource)) ||
      (move !== undefined && !isEditingCommitMove(move)) ||
      typeof refreshProjection !== 'function'
    ) {
      return Object.freeze({ kind: 'invalid' })
    }
    return Object.freeze({
      kind: 'captured',
      commitSource,
      move,
      refreshProjection,
      timeoutMs,
    })
  } catch {
    return Object.freeze({ kind: 'invalid' })
  }
}

export function captureEditingRetryInput(
  input: RetryEditingRefreshInput,
): CapturedEditingRetryInput {
  try {
    const refreshProjection = input.refreshProjection
    const timeoutMs = normalizeEditingTimeout(input.timeoutMs)
    return typeof refreshProjection === 'function'
      ? Object.freeze({ kind: 'captured', refreshProjection, timeoutMs })
      : Object.freeze({ kind: 'invalid' })
  } catch {
    return Object.freeze({ kind: 'invalid' })
  }
}

function isValidMutationRevision(value: unknown): value is ProjectionRevision {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0
  return typeof value === 'string' && value.trim().length > 0 && value.trim() !== '0'
}

function isSafeCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

export function snapshotEditingAcknowledgement(
  value: unknown,
  ticket: EditingCommitTicket,
): EditingCommitAcknowledgement | null {
  try {
    if (typeof value !== 'object' || value === null) return null
    const result = value as Partial<EditingCommitAcknowledgement>
    // Read each field once. Accessors may be stateful or synchronously re-enter Core.
    const sheetId = result.sheetId
    const requestId = result.requestId
    const revision = result.revision
    const rangeValue = result.affectedRange
    if (
      sheetId !== ticket.request.sheetId ||
      requestId !== ticket.requestId ||
      !Number.isSafeInteger(requestId) ||
      !isValidMutationRevision(revision)
    ) {
      return null
    }

    let affectedRange: EditingCommitAcknowledgement['affectedRange']
    if (rangeValue !== undefined) {
      if (typeof rangeValue !== 'object' || rangeValue === null) return null
      // Do not spread this object: the four validated reads are the complete trust boundary.
      const rowStart = rangeValue.rowStart
      const rowEnd = rangeValue.rowEnd
      const colStart = rangeValue.colStart
      const colEnd = rangeValue.colEnd
      if (
        !isSafeCoord(rowStart) ||
        !isSafeCoord(rowEnd) ||
        !isSafeCoord(colStart) ||
        !isSafeCoord(colEnd) ||
        rowStart > ticket.request.row ||
        rowEnd < ticket.request.row ||
        colStart > ticket.request.col ||
        colEnd < ticket.request.col
      ) {
        return null
      }
      affectedRange = Object.freeze({ rowStart, rowEnd, colStart, colEnd })
    }

    return Object.freeze({
      sheetId,
      requestId,
      revision,
      ...(affectedRange === undefined ? {} : { affectedRange }),
    })
  } catch {
    return null
  }
}
