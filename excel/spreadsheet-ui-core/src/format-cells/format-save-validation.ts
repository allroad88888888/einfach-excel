import type { CellRange } from '../shared'
import type { FormatCellsLocalAcknowledgement, FormatCellsSaveRequest } from './types'

export function sameRange(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

export function isValidRange(range: CellRange): boolean {
  return (
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowEnd >= range.rowStart &&
    range.colEnd >= range.colStart
  )
}

export function freezeJsonSnapshot<T>(value: T): T {
  const clone = JSON.parse(JSON.stringify(value)) as T
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || Object.isFrozen(candidate)) return
    for (const child of Object.values(candidate as Record<string, unknown>)) freeze(child)
    Object.freeze(candidate)
  }
  freeze(clone)
  return clone
}

export function snapshotLocalAcknowledgement(
  value: unknown,
  request: FormatCellsSaveRequest,
): {
  readonly acknowledgement: FormatCellsLocalAcknowledgement | null
  readonly error: string | null
} {
  if (value === null || typeof value !== 'object') {
    return { acknowledgement: null, error: 'Format save acknowledgement must be an object' }
  }
  try {
    const record = value as Record<string, unknown>
    const kind = record.kind
    const dialog = record.dialog
    const sheetId = record.sheetId
    const rangeValue = record.range
    const sessionId = record.sessionId
    const requestId = record.requestId
    if (kind !== 'local-acknowledged' || dialog !== request.dialog) {
      return { acknowledgement: null, error: 'Format save acknowledgement kind did not match' }
    }
    if (sheetId !== request.sheetId) {
      return { acknowledgement: null, error: 'Format save acknowledgement sheet did not match' }
    }
    if (
      typeof sessionId !== 'number' ||
      !Number.isSafeInteger(sessionId) ||
      sessionId !== request.sessionId ||
      typeof requestId !== 'number' ||
      !Number.isSafeInteger(requestId) ||
      requestId !== request.requestId
    ) {
      return { acknowledgement: null, error: 'Format save acknowledgement identity did not match' }
    }
    if (rangeValue === null || typeof rangeValue !== 'object') {
      return { acknowledgement: null, error: 'Format save acknowledgement range was invalid' }
    }
    const rangeRecord = rangeValue as Record<string, unknown>
    const range: CellRange = {
      rowStart: rangeRecord.rowStart as number,
      rowEnd: rangeRecord.rowEnd as number,
      colStart: rangeRecord.colStart as number,
      colEnd: rangeRecord.colEnd as number,
    }
    if (!isValidRange(range) || !sameRange(range, request.range)) {
      return { acknowledgement: null, error: 'Format save acknowledgement range did not match' }
    }
    return {
      acknowledgement: Object.freeze({
        kind: 'local-acknowledged',
        dialog: request.dialog,
        sheetId: request.sheetId,
        range: Object.freeze({ ...range }),
        sessionId,
        requestId,
      }),
      error: null,
    }
  } catch {
    return {
      acknowledgement: null,
      error: 'Format save acknowledgement was invalid or unreadable',
    }
  }
}

export function snapshotSourceRanges(value: unknown): readonly CellRange[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 10_000) return null
  try {
    const ranges: CellRange[] = []
    for (const candidate of [...value]) {
      if (candidate === null || typeof candidate !== 'object') return null
      const record = candidate as Record<string, unknown>
      const range: CellRange = {
        rowStart: record.rowStart as number,
        rowEnd: record.rowEnd as number,
        colStart: record.colStart as number,
        colEnd: record.colEnd as number,
      }
      if (!isValidRange(range)) return null
      ranges.push(Object.freeze(range))
    }
    return Object.freeze(ranges)
  } catch {
    return null
  }
}

export function validateBackendAcknowledgement(
  value: unknown,
  request: FormatCellsSaveRequest,
  sourceRange: CellRange,
): string | null {
  if (value === null || typeof value !== 'object') {
    return 'Format range acknowledgement must be an object'
  }
  try {
    const record = value as Record<string, unknown>
    const sheetId = record.sheetId
    const requestId = record.requestId
    const affectedRangeValue = record.affectedRange
    if (sheetId !== request.sheetId) {
      return 'Format range acknowledgement sheet did not match'
    }
    if (
      typeof requestId !== 'number' ||
      !Number.isSafeInteger(requestId) ||
      requestId !== request.requestId
    ) {
      return 'Format range acknowledgement request id did not match'
    }
    if (affectedRangeValue !== undefined) {
      if (affectedRangeValue === null || typeof affectedRangeValue !== 'object') {
        return 'Format range acknowledgement affected range was invalid'
      }
      const rangeRecord = affectedRangeValue as Record<string, unknown>
      const affectedRange: CellRange = {
        rowStart: rangeRecord.rowStart as number,
        rowEnd: rangeRecord.rowEnd as number,
        colStart: rangeRecord.colStart as number,
        colEnd: rangeRecord.colEnd as number,
      }
      if (!isValidRange(affectedRange) || !sameRange(affectedRange, sourceRange)) {
        return 'Format range acknowledgement affected a different range'
      }
    }
    return null
  } catch {
    return 'Format range acknowledgement was invalid or unreadable'
  }
}
