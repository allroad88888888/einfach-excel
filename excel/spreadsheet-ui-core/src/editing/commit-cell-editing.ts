import { atom, type Getter, type Setter } from '@einfach/core'
import type { ProjectionRevision } from '../backend'
import { keyboardModeAtom } from '../keyboard'
import {
  applyVisibleProjectionAtom,
  createVisibleProjectionRequest,
  issueProjectionRequestIdAtom,
  projectionSnapshotAtom,
  type ProjectionSnapshot,
} from '../projection'
import { setRustCellInputAtom, type RustSetCellInputResult } from '../rust-workbook'
import {
  editingErrorMessage,
  normalizeEditingTimeout,
  runBoundedEditingOperation,
} from './bounded-operation'
import {
  activeEditingCommitTicketAtom,
  editingCommitLifecycleBackingAtom,
  editingSessionBackingAtom,
  editingTicketIsCurrent,
  lifecycleFor,
  type EditingCommitTicket,
} from './commit-state'
import { resolveContentMutationAtom } from './mutation-gateway'
import { createEditingSessionState } from './session-domain'
import type {
  CommitCellEditingInput,
  EditingCommitOutcome,
  EditingCommitRequest,
  EditingSessionState,
} from './types'

function isCommittedRevision(value: ProjectionRevision | undefined): value is ProjectionRevision {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0
  return typeof value === 'string' && value.trim().length > 0 && value.trim() !== '0'
}

function responseAcknowledgesRequest(
  response: RustSetCellInputResult,
  request: EditingCommitRequest,
): boolean {
  const acknowledgement = response.acknowledgement
  return (
    acknowledgement.sheetId === request.sheetId &&
    acknowledgement.requestId === request.requestId &&
    isCommittedRevision(acknowledgement.revision)
  )
}

function rejectCommit(set: Setter, detail: string): EditingCommitOutcome {
  set(editingCommitLifecycleBackingAtom, lifecycleFor('rejected', detail))
  set(activeEditingCommitTicketAtom, null)
  return 'rejected'
}

function blockCommit(set: Setter, detail: string): EditingCommitOutcome {
  set(editingCommitLifecycleBackingAtom, lifecycleFor('blocked', detail))
  return 'blocked'
}

function authorityIsCurrent(
  get: Getter,
  session: EditingSessionState,
  projection: ProjectionSnapshot,
): boolean {
  return (
    get(activeEditingCommitTicketAtom) === null &&
    get(editingSessionBackingAtom) === session &&
    get(projectionSnapshotAtom) === projection
  )
}

/** Submits the current draft and directly publishes the projection returned by Rust. */
export const commitCellEditingAtom = atom(
  null,
  async (
    get,
    set,
    input?: CommitCellEditingInput,
  ): Promise<EditingCommitOutcome> => {
    if (get(activeEditingCommitTicketAtom) !== null) return 'blocked'

    const session = get(editingSessionBackingAtom)
    const projectionWitness = get(projectionSnapshotAtom)
    const visibleRequest = projectionWitness.request
    if (
      session.status !== 'drafting' ||
      session.source === null ||
      visibleRequest?.kind !== 'visible-window' ||
      visibleRequest.sheetId !== session.source.sheetId
    ) {
      return blockCommit(set, 'The current edit or visible projection is unavailable.')
    }

    const resolution = set(resolveContentMutationAtom, {
      kind: 'set-cell-input',
      sheetId: session.source.sheetId,
      cell: session.source.cell,
    })
    if (!authorityIsCurrent(get, session, projectionWitness)) return 'blocked'
    if (resolution.status === 'blocked') {
      return blockCommit(set, resolution.diagnostic.message)
    }

    // One Worker command needs one correlation id; mutation ACK and projection share it.
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) {
      return blockCommit(set, 'Editing request identity space is exhausted.')
    }

    const target = resolution.cell ?? session.source.cell
    const request: EditingCommitRequest = Object.freeze({
      kind: 'set-cell-input',
      sheetId: session.source.sheetId,
      row: target.row,
      col: target.col,
      input: session.draft,
      requestId,
    })
    const projectionRequest = Object.freeze(
      createVisibleProjectionRequest({
        sheetId: visibleRequest.sheetId,
        window: visibleRequest.window,
        requestId,
        reason: visibleRequest.reason,
      }),
    )
    const ticket: EditingCommitTicket = Object.freeze({ request })
    const pendingLifecycle = lifecycleFor('pending')

    // The ticket is the lock. Publish it before launching any asynchronous work.
    set(activeEditingCommitTicketAtom, ticket)
    set(editingCommitLifecycleBackingAtom, pendingLifecycle)

    const transport = await runBoundedEditingOperation(
      () => set(setRustCellInputAtom, { request, projection: projectionRequest }),
      normalizeEditingTimeout(input?.timeoutMs),
    )
    if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return 'blocked'

    if (transport.kind === 'timeout') {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleFor('outcome-unknown', 'Editing commit timed out; its backend outcome is unknown.'),
      )
      // Keep the ticket: blindly retrying an unknown write can duplicate a mutation.
      return 'outcome-unknown'
    }
    if (transport.kind === 'rejected') {
      return rejectCommit(
        set,
        `Editing commit was rejected and may be retried: ${editingErrorMessage(transport.error)}`,
      )
    }
    if (!responseAcknowledgesRequest(transport.value, request)) {
      set(
        editingCommitLifecycleBackingAtom,
        lifecycleFor('outcome-unknown', 'Editing acknowledgement did not match the active request.'),
      )
      return 'outcome-unknown'
    }

    // A newer viewport wins. Otherwise use the projection bundled with this exact mutation.
    set(applyVisibleProjectionAtom, {
      witness: projectionWitness,
      request: projectionRequest,
      result: transport.value.projection,
    })
    set(editingSessionBackingAtom, createEditingSessionState())
    set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
    set(keyboardModeAtom, 'navigation')
    set(activeEditingCommitTicketAtom, null)
    return 'completed'
  },
)

commitCellEditingAtom.debugLabel = 'spreadsheet.editing.commitCell'
