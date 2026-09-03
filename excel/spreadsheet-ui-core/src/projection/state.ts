import { atom, type Atom } from '@einfach/core'
import type {
  ProjectionRequestId,
  RangeProjectionRequest,
  VisibleProjectionRequest,
} from '../backend'
import type { SpreadsheetError } from '../shared'
import { getProjectionRequestRange } from './contracts'
import type {
  ProjectionRequest,
  ProjectionResult,
  ProjectionSnapshot,
  ProjectionValidationError,
} from './types'

const MAX_PROJECTION_ERROR_TEXT = 512

export const IDLE_PROJECTION_SNAPSHOT: ProjectionSnapshot = Object.freeze({
  status: 'idle',
  request: undefined,
  result: undefined,
  error: undefined,
})

export interface ProjectionLaneTicket<Request extends ProjectionRequest = ProjectionRequest> {
  readonly request: Request
  readonly retainResult: boolean
}

export interface ProjectionLaneState {
  readonly visibleWindow: {
    readonly active: ProjectionLaneTicket<VisibleProjectionRequest> | null
    readonly queued: ProjectionLaneTicket<VisibleProjectionRequest> | null
  }
  readonly range: ProjectionLaneTicket<RangeProjectionRequest> | null
}

const EMPTY_PROJECTION_LANES: ProjectionLaneState = Object.freeze({
  visibleWindow: Object.freeze({ active: null, queued: null }),
  range: null,
})

function freezeValue<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => freezeValue(item))) as T
  }
  const snapshot: Record<string, unknown> = {}
  for (const [key, child] of Object.entries(value)) snapshot[key] = freezeValue(child)
  return Object.freeze(snapshot) as T
}

export function freezeProjectionRequest(request: ProjectionRequest): ProjectionRequest {
  return freezeValue(request)
}

export function freezeProjectionResult(result: ProjectionResult): ProjectionResult {
  return freezeValue(result)
}

export function freezeProjectionValidationError(
  error: ProjectionValidationError,
): ProjectionValidationError {
  return freezeValue(error)
}

export function freezeProjectionSnapshot(snapshot: ProjectionSnapshot): ProjectionSnapshot {
  return Object.freeze({
    status: snapshot.status,
    request: snapshot.request,
    result: snapshot.result,
    error: snapshot.error,
  })
}

function boundedText(value: unknown, fallback: string): string {
  const text = typeof value === 'string' && value.length > 0 ? value : fallback
  return text.slice(0, MAX_PROJECTION_ERROR_TEXT)
}

export function projectionErrorFrom(
  error: unknown,
  fallbackMessage = 'Spreadsheet projection failed.',
  code?: string,
): SpreadsheetError {
  const source = typeof error === 'object' && error !== null
    ? error as Partial<SpreadsheetError>
    : {}
  const message = error instanceof Error
    ? error.message
    : typeof source.message === 'string'
      ? source.message
      : fallbackMessage
  const snapshot: SpreadsheetError = {
    code: boundedText(source.code, code ?? 'BACKEND_ERROR'),
    message: boundedText(message, fallbackMessage),
  }
  if (source.severity !== undefined) snapshot.severity = source.severity
  if (source.source !== undefined) snapshot.source = source.source
  if (source.hint !== undefined) snapshot.hint = boundedText(source.hint, '')
  return Object.freeze(snapshot)
}

function sameRange(
  left: ReturnType<typeof getProjectionRequestRange>,
  right: ReturnType<typeof getProjectionRequestRange>,
): boolean {
  return left.rowStart === right.rowStart && left.rowEnd === right.rowEnd &&
    left.colStart === right.colStart && left.colEnd === right.colEnd
}

export function sameProjectionRequest(left: ProjectionRequest, right: ProjectionRequest): boolean {
  return left.kind === right.kind && left.sheetId === right.sheetId &&
    left.requestId === right.requestId && left.revision === right.revision &&
    sameRange(getProjectionRequestRange(left), getProjectionRequestRange(right))
}

/** Crosses the positive safe-integer boundary once, then descends without reuse. */
export function nextProjectionRequestId(sequence: number): ProjectionRequestId | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

export const projectionSnapshotBackingAtom = atom<ProjectionSnapshot>(IDLE_PROJECTION_SNAPSHOT)
export const projectionRequestSequenceBackingAtom = atom(0)
export const projectionLaneBackingAtom = atom<ProjectionLaneState>(EMPTY_PROJECTION_LANES)

projectionSnapshotBackingAtom.debugLabel = 'spreadsheet.projection.snapshot.state'
projectionRequestSequenceBackingAtom.debugLabel = 'spreadsheet.projection.requestSequence.state'
projectionLaneBackingAtom.debugLabel = 'spreadsheet.projection.lanes.state'

export const projectionSnapshotAtom: Atom<ProjectionSnapshot> = atom((get) =>
  get(projectionSnapshotBackingAtom),
)
projectionSnapshotAtom.debugLabel = 'spreadsheet.projection.snapshot'

export const projectionRequestIdAtom: Atom<number> = atom((get) =>
  get(projectionRequestSequenceBackingAtom),
)
projectionRequestIdAtom.debugLabel = 'spreadsheet.projection.requestId'

export const issueProjectionRequestIdAtom = atom(
  (get) => get(projectionRequestIdAtom),
  (get, set): ProjectionRequestId | null => {
    const next = nextProjectionRequestId(get(projectionRequestSequenceBackingAtom))
    if (next !== null) set(projectionRequestSequenceBackingAtom, next)
    return next
  },
)
issueProjectionRequestIdAtom.debugLabel = 'spreadsheet.projection.issueRequestId'
