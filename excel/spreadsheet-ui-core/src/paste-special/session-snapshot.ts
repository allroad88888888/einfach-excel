import type { ProjectionRequestId } from '../backend/types'
import type { ClipboardPayloadDescriptor, ClipboardRangeDescriptor } from '../clipboard/types'
import type { CellRange } from '../shared'
import {
  PASTE_SPECIAL_CAPABILITY_ERROR,
  PASTE_SPECIAL_CONTEXT_ERROR,
  PASTE_SPECIAL_UNSUPPORTED_KIND_ERROR,
  isPasteSpecialKindSupported,
  pasteSpecialBackendKindError,
} from './constants'
import type {
  PasteSpecialKind,
  PasteSpecialLifecycleState,
  PasteSpecialOptions,
  PasteSpecialSessionSnapshot,
} from './types'

export const INITIAL_PASTE_SPECIAL_LIFECYCLE: PasteSpecialLifecycleState = Object.freeze({
  status: 'closed',
  sessionId: 0,
  requestId: null,
  sheetId: null,
})

function nextSafeMonotonicIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) {
    return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  }
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export function nextPasteSpecialSessionId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function nextPasteSpecialRequestId(sequence: number): number | null {
  return nextSafeMonotonicIdentity(sequence)
}

export function snapshotRange(range: CellRange | null | undefined): CellRange | null {
  if (range == null) return null
  try {
    return Object.freeze({
      rowStart: range.rowStart,
      rowEnd: range.rowEnd,
      colStart: range.colStart,
      colEnd: range.colEnd,
    })
  } catch {
    return null
  }
}

export function snapshotSource(
  source: ClipboardRangeDescriptor | null | undefined,
): ClipboardRangeDescriptor | null {
  if (source == null) return null
  try {
    const range = snapshotRange(source.range)
    if (range === null || typeof source.sheetId !== 'string') return null
    return Object.freeze({ sheetId: source.sheetId, range })
  } catch {
    return null
  }
}

export function snapshotPayload(
  payload: ClipboardPayloadDescriptor | null | undefined,
): ClipboardPayloadDescriptor | null {
  if (payload == null) return null
  try {
    const source = snapshotSource(payload.source)
    if (source === null) return null
    return Object.freeze({
      kind: payload.kind,
      source,
      serialization: payload.serialization,
      cellCount: payload.cellCount,
      estimatedBytes: payload.estimatedBytes,
      truncated: payload.truncated,
      includesFormulas: payload.includesFormulas,
      includesErrors: payload.includesErrors,
    })
  } catch {
    return null
  }
}

export function snapshotPasteSpecialOptions(options: PasteSpecialOptions): PasteSpecialOptions {
  return Object.freeze({
    kind: options.kind,
    op: options.op,
    transpose: options.transpose,
    skipBlanks: options.skipBlanks,
  })
}

export function isValidPasteSpecialRange(range: CellRange | null): range is CellRange {
  return (
    range !== null &&
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowStart <= range.rowEnd &&
    range.colStart <= range.colEnd
  )
}

export function samePasteSpecialRange(left: CellRange, right: CellRange): boolean {
  return (
    left.rowStart === right.rowStart &&
    left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart &&
    left.colEnd === right.colEnd
  )
}

export function pasteSpecialSessionBlockReason(
  session: PasteSpecialSessionSnapshot | null,
  capability: boolean,
  supportedKinds: readonly PasteSpecialKind[],
): string | null {
  if (session !== null && !isPasteSpecialKindSupported(session.options.kind)) {
    return PASTE_SPECIAL_UNSUPPORTED_KIND_ERROR
  }
  if (!capability) return PASTE_SPECIAL_CAPABILITY_ERROR
  if (session !== null && !supportedKinds.includes(session.options.kind)) {
    return pasteSpecialBackendKindError(session.options.kind)
  }
  if (
    session === null ||
    session.sheetId === null ||
    session.sheetId.length === 0 ||
    !isValidPasteSpecialRange(session.target) ||
    session.source === null ||
    session.source.sheetId.length === 0 ||
    !isValidPasteSpecialRange(session.source.range) ||
    session.payload === null ||
    session.payload.source.sheetId !== session.source.sheetId ||
    !samePasteSpecialRange(session.payload.source.range, session.source.range)
  ) {
    return PASTE_SPECIAL_CONTEXT_ERROR
  }
  return null
}

export function pasteSpecialLifecycle(
  status: PasteSpecialLifecycleState['status'],
  sessionId: number,
  sheetId: string | null,
  requestId: ProjectionRequestId | null = null,
): PasteSpecialLifecycleState {
  return Object.freeze({ status, sessionId, requestId, sheetId })
}

export function pasteSpecialBlocksClose(status: PasteSpecialLifecycleState['status']): boolean {
  return status === 'pending' || status === 'local-acknowledged' || status === 'refreshing'
}

export function pasteSpecialErrorMessage(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === 'string') return error.message
  } catch {
    // Fall through to guarded coercion.
  }
  try {
    return String(error)
  } catch {
    return 'Unknown Paste Special transport failure.'
  }
}
