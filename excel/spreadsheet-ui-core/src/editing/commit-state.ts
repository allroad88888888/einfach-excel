/**
 * Private serialization state for editing commits.
 *
 * Exact ticket identity serializes asynchronous boundaries. A smaller pre-ticket snapshot
 * protects only caller-controlled reads; internal atom writes are published as one ordered phase.
 */
import { atom, type Atom, type Getter, type Setter } from '@einfach/core'
import type { ProjectionRevision } from '../backend/types'
import type { HistoryProducerReservation } from '../history'
import type {
  EditingCommitIntent,
  EditingCommitLifecycleState,
  EditingCommitRequest,
  EditingControllerPort,
  EditingIntent,
  EditingSessionState,
  RunEditingCommitInput,
} from './types'
import { createEditingSessionState } from './session-domain'

export interface EditingSessionSnapshot {
  /** Exact state captured before reading caller-controlled commit capabilities. */
  readonly session: EditingSessionState
  readonly sequence: number
  readonly lifecycle: EditingCommitLifecycleState
}

export interface EditingCommitTicket {
  /** The ticket object itself is the private lane lock for one serialized commit. */
  readonly sessionId: number
  readonly requestId: number
  readonly intent: EditingCommitIntent
  readonly request: EditingCommitRequest
  readonly source: EditingControllerPort
  readonly execute: NonNullable<EditingControllerPort['setCellInput']>
  readonly refreshProjection: RunEditingCommitInput['refreshProjection']
  readonly timeoutMs: number
  /** UI timeline ownership only; the Rust backend owns the actual undo images. */
  readonly historyReservation: HistoryProducerReservation | null
}

interface EditingRawTransportState {
  readonly requestId: number
  readonly settled: boolean
}

const INITIAL_EDITING_LIFECYCLE: EditingCommitLifecycleState = Object.freeze({
  status: 'ready',
  sessionId: 0,
  requestId: null,
  sheetId: null,
  cell: null,
  acknowledgedRevision: null,
  error: '',
})

export function lifecycleFor(
  status: EditingCommitLifecycleState['status'],
  input: {
    readonly sessionId?: number
    readonly requestId?: number | null
    readonly sheetId?: string | null
    readonly cell?: Readonly<{ row: number; col: number }> | null
    readonly acknowledgedRevision?: ProjectionRevision | null
    readonly error?: string
  } = {},
): EditingCommitLifecycleState {
  return Object.freeze({
    status,
    sessionId: input.sessionId ?? 0,
    requestId: input.requestId ?? null,
    sheetId: input.sheetId ?? null,
    cell:
      input.cell === null || input.cell === undefined
        ? null
        : Object.freeze({ row: input.cell.row, col: input.cell.col }),
    acknowledgedRevision: input.acknowledgedRevision ?? null,
    error: input.error ?? '',
  })
}

export function lifecycleForTicket(
  status: EditingCommitLifecycleState['status'],
  ticket: EditingCommitTicket,
  acknowledgedRevision: ProjectionRevision | null = null,
  error = '',
): EditingCommitLifecycleState {
  return lifecycleFor(status, {
    sessionId: ticket.sessionId,
    requestId: ticket.requestId,
    sheetId: ticket.request.sheetId,
    cell: ticket.intent.cell,
    acknowledgedRevision,
    error,
  })
}

export function nextSafeEditingIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence) || sequence < 0) return null
  return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : null
}

export const editingSessionBackingAtom = atom<EditingSessionState>(createEditingSessionState())
editingSessionBackingAtom.debugLabel = 'spreadsheet.editing.sessionBacking'

export const editingIntentBackingAtom = atom<EditingIntent | null>(null)
editingIntentBackingAtom.debugLabel = 'spreadsheet.editing.intentBacking'

export const editingCommitLifecycleBackingAtom =
  atom<EditingCommitLifecycleState>(INITIAL_EDITING_LIFECYCLE)
editingCommitLifecycleBackingAtom.debugLabel = 'spreadsheet.editing.commitLifecycleBacking'

export const activeEditingCommitTicketAtom = atom<EditingCommitTicket | null>(null)
activeEditingCommitTicketAtom.debugLabel = 'spreadsheet.editing.activeCommitTicket'

// Session and request identities distinguish editor ownership from one concrete mutation.
export const editingSessionSequenceAtom = atom(0)
editingSessionSequenceAtom.debugLabel = 'spreadsheet.editing.sessionSequence'

export const editingRequestSequenceAtom = atom(0)
editingRequestSequenceAtom.debugLabel = 'spreadsheet.editing.requestSequence'

export const editingRawTransportStateAtom = atom<EditingRawTransportState | null>(null)
editingRawTransportStateAtom.debugLabel = 'spreadsheet.editing.rawTransportState'

/** Captures the editable state before crossing a caller-controlled boundary. */
export function captureEditingSessionSnapshot(get: Getter): EditingSessionSnapshot {
  return Object.freeze({
    session: get(editingSessionBackingAtom),
    sequence: get(editingSessionSequenceAtom),
    lifecycle: get(editingCommitLifecycleBackingAtom),
  })
}

export function editingSessionSnapshotIsCurrent(
  get: Getter,
  snapshot: EditingSessionSnapshot,
): boolean {
  return (
    get(activeEditingCommitTicketAtom) === null &&
    get(editingSessionBackingAtom) === snapshot.session &&
    get(editingSessionSequenceAtom) === snapshot.sequence &&
    get(editingCommitLifecycleBackingAtom) === snapshot.lifecycle
  )
}

function editingLifecycleBelongsToTicket(
  lifecycle: EditingCommitLifecycleState,
  ticket: EditingCommitTicket,
): boolean {
  return (
    lifecycle.sessionId === ticket.sessionId &&
    lifecycle.requestId === ticket.requestId &&
    lifecycle.sheetId === ticket.request.sheetId &&
    lifecycle.cell?.row === ticket.intent.cell.row &&
    lifecycle.cell.col === ticket.intent.cell.col
  )
}

export function editingTicketIsCurrent(
  get: Getter,
  ticket: EditingCommitTicket,
  lifecycleWitness?: EditingCommitLifecycleState,
): boolean {
  const lifecycle = get(editingCommitLifecycleBackingAtom)
  return (
    get(activeEditingCommitTicketAtom) === ticket &&
    (lifecycleWitness === undefined || lifecycle === lifecycleWitness) &&
    editingLifecycleBelongsToTicket(lifecycle, ticket)
  )
}

export function editingRawTransportIsSettled(get: Getter, ticket: EditingCommitTicket): boolean {
  const raw = get(editingRawTransportStateAtom)
  return raw?.requestId === ticket.requestId && raw.settled
}

export function markEditingRawTransportSettled(set: Setter, ticket: EditingCommitTicket): void {
  // A late promise may settle after another operation exists; never mark the newer transport.
  set(editingRawTransportStateAtom, (raw) =>
    raw?.requestId === ticket.requestId && !raw.settled
      ? Object.freeze({ requestId: ticket.requestId, settled: true })
      : raw,
  )
}

export const editingCommitLifecycleAtom: Atom<EditingCommitLifecycleState> = atom((get) =>
  get(editingCommitLifecycleBackingAtom),
)
editingCommitLifecycleAtom.debugLabel = 'spreadsheet.editing.commitLifecycle'

/** Exposes reset safety without retaining or revealing the host promise. */
export const editingCommitRawTransportSettledAtom: Atom<boolean> = atom((get) => {
  const ticket = get(activeEditingCommitTicketAtom)
  return ticket !== null && editingRawTransportIsSettled(get, ticket)
})
editingCommitRawTransportSettledAtom.debugLabel = 'spreadsheet.editing.rawTransportSettled'
