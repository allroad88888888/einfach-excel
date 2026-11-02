import { atom, type Getter, type Setter } from '@einfach/core'
import type {
  ProjectionRevision, VisibleProjectionRequest, VisibleProjectionResult,
} from '../contracts'
import { keyboardModeAtom } from '../keyboard'
import { resetFormulaReferenceStateAtom } from '../formula-reference/state'
import {
  applyVisibleProjectionAtom, createVisibleProjectionRequest, issueProjectionRequestIdAtom,
  projectionSnapshotAtom, type ProjectionSnapshot,
} from '../projection'
import { runVisibleProjectionAtom } from '../projection/run-visible-projection'
import { setRustCellInputAtom, type RustSetCellInputResult } from '../rust-workbook'
import {
  editingErrorMessage, normalizeEditingTimeout, runBoundedEditingOperation,
} from './bounded-operation'
import {
  activeEditingCommitTicketAtom, editingCommitLifecycleBackingAtom, editingSessionBackingAtom,
  editingTicketIsCurrent, lifecycleFor, type EditingCommitTicket,
} from './commit-state'
import { resolveContentMutationAtom } from './mutation-gateway'
import { createEditingSessionState } from './session-domain'
import { returnToEditingSource } from './session-atoms'
import { activeWorkbookSheetAtom } from '../runtime/workbook-document'
import { sheetViewsBackingAtom } from '../runtime/sheet-view-state'
import { selectionAuthorityWitnessAtom } from '../selection'
import { getSheetProtection, sheetProtectionAtom } from '../protection'
import { offerNativeValidationConfirmationAtom } from '../data-validation/advanced/confirmation-state'
import type {
  CommitCellEditingInput, EditingCommitOutcome, EditingCommitRequest, EditingSessionState,
} from './types'

interface TicketProgress {
  settled: boolean
  reconciling: boolean
}

const ticketProgress = new WeakMap<EditingCommitTicket, TicketProgress>()

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

function completeAcceptedCommit(
  get: Getter,
  set: Setter,
  session: EditingSessionState,
  browsingSheetId: string | undefined,
  selectionWitness: unknown,
  projectionWitness: ProjectionSnapshot,
  projectionRequest: VisibleProjectionRequest,
  result: VisibleProjectionResult,
  returnToSource: boolean | undefined,
): EditingCommitOutcome {
  // A newer viewport wins. Otherwise use the projection bundled with this exact mutation.
  set(applyVisibleProjectionAtom, {
    witness: projectionWitness, request: projectionRequest, result,
  })
  set(resetFormulaReferenceStateAtom)
  set(editingSessionBackingAtom, createEditingSessionState())
  set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
  set(keyboardModeAtom, 'navigation')
  set(activeEditingCommitTicketAtom, null)
  // 写入目标来自编辑源，投影来自当前浏览表；确认后才回源，不在拾取期间改工作簿。
  // 等待 Rust 期间已定位到其它格时，不让旧提交把用户拉回原位置。
  if (
    returnToSource !== false &&
    get(activeWorkbookSheetAtom)?.id === browsingSheetId &&
    get(selectionAuthorityWitnessAtom) === selectionWitness
  )
    returnToEditingSource(get, set, session)
  else if (returnToSource !== false) {
    // 用户在等待期间已主动定位：保留新位置，把它作为之后的普通视图。
    const memory = get(sheetViewsBackingAtom)
    if (memory.referenceBrowsing)
      set(sheetViewsBackingAtom, { ...memory, referenceBrowsing: false })
  }
  return 'completed'
}

/** Submits the current draft and directly publishes the projection returned by Rust. */
export const commitCellEditingAtom = atom(
  null,
  async (get, set, input?: CommitCellEditingInput): Promise<EditingCommitOutcome> => {
    if (get(activeEditingCommitTicketAtom) !== null) return 'blocked'

    const session = get(editingSessionBackingAtom)
    const selectionWitness = get(selectionAuthorityWitnessAtom)
    const browsingSheetId = get(activeWorkbookSheetAtom)?.id
    const projectionWitness = get(projectionSnapshotAtom)
    const visibleRequest = projectionWitness.request
    if (
      session.status !== 'drafting' ||
      session.source === null ||
      visibleRequest?.kind !== 'visible-window'
    ) {
      return blockCommit(set, 'The current edit or visible projection is unavailable.')
    }

    const resolution = set(resolveContentMutationAtom, {
      kind: 'set-cell-input',
      sheetId: session.source.sheetId,
      cell: session.source.cell,
    })
    if (!authorityIsCurrent(get, session, projectionWitness)) return 'blocked'
    if (resolution.status === 'blocked') return blockCommit(set, resolution.diagnostic.message)

    // One Worker command needs one correlation id; mutation ACK and projection share it.
    const requestId = set(issueProjectionRequestIdAtom)
    if (requestId === null) return blockCommit(set, 'Editing request identity space is exhausted.')

    const target = resolution.cell ?? session.source.cell
    const request: EditingCommitRequest = Object.freeze({
      kind: 'set-cell-input',
      sheetId: session.source.sheetId,
      row: target.row,
      col: target.col,
      input: session.draft,
      ...(input?.validationConfirmation === 'continue' ? {
        validationConfirmation: 'continue', validationRevision: input.validationRevision,
      } : {}),
      ...(getSheetProtection(get(sheetProtectionAtom), session.source.sheetId).mode === 'protected'
        ? { expandTables: false }
        : {}),
      requestId,
    })
    const projectionRequest = Object.freeze(createVisibleProjectionRequest({
      sheetId: visibleRequest.sheetId, window: visibleRequest.window,
      viewport: visibleRequest.viewport, requestId, reason: visibleRequest.reason,
    }))
    let resolveCompletion!: (outcome: EditingCommitOutcome) => void
    const completion = new Promise<EditingCommitOutcome>((resolve) => {
      resolveCompletion = resolve
    })
    const finish = (outcome: EditingCommitOutcome): EditingCommitOutcome => {
      resolveCompletion(outcome)
      return outcome
    }
    const ticket: EditingCommitTicket = Object.freeze({ request, completion })
    const progress: TicketProgress = { settled: false, reconciling: false }
    ticketProgress.set(ticket, progress)
    const pendingLifecycle = lifecycleFor('pending')

    // The ticket is the lock. Publish it before launching any asynchronous work.
    set(activeEditingCommitTicketAtom, ticket)
    set(editingCommitLifecycleBackingAtom, pendingLifecycle)

    try {
      const rawTransport = Promise.resolve(
        set(setRustCellInputAtom, { request, projection: projectionRequest }),
      )
      const observedTransport = rawTransport.then(
        (value) => { progress.settled = true; return value },
        (error: unknown) => { progress.settled = true; throw error },
      )
      const transport = await runBoundedEditingOperation(
        () => observedTransport,
        normalizeEditingTimeout(input?.timeoutMs),
      )
      if (!editingTicketIsCurrent(get, ticket, pendingLifecycle)) return finish('blocked')

      if (transport.kind === 'timeout') {
        const unknownLifecycle = lifecycleFor(
          'outcome-unknown',
          'Editing commit timed out; its backend outcome is unknown.',
        )
        set(editingCommitLifecycleBackingAtom, unknownLifecycle)
        // Reconcile when the in-flight request eventually settles so the lock is not permanent.
        void rawTransport.then(
          (value) => {
            progress.settled = true
            if (!editingTicketIsCurrent(get, ticket, unknownLifecycle)) return
            if (!responseAcknowledgesRequest(value, request)) {
              set(editingCommitLifecycleBackingAtom, lifecycleFor('outcome-unknown',
                'Editing acknowledgement did not match the active request.'))
              return
            }
            completeAcceptedCommit(get, set, session, browsingSheetId, selectionWitness,
              projectionWitness, projectionRequest, value.projection, input?.returnToSource)
          },
          (error: unknown) => {
            progress.settled = true
            if (!editingTicketIsCurrent(get, ticket, unknownLifecycle)) return
            set(offerNativeValidationConfirmationAtom, { error,
              operation: { command: 'cell.setInput' }, witness: projectionWitness })
            rejectCommit(set,
              `Editing commit was rejected and may be retried: ${editingErrorMessage(error)}`)
          },
        )
        return finish('outcome-unknown')
      }
      if (transport.kind === 'rejected') {
        set(offerNativeValidationConfirmationAtom, { error: transport.error,
          operation: { command: 'cell.setInput' }, witness: projectionWitness })
        return finish(rejectCommit(set,
          `Editing commit was rejected and may be retried: ${editingErrorMessage(transport.error)}`))
      }
      if (!responseAcknowledgesRequest(transport.value, request)) {
        set(editingCommitLifecycleBackingAtom, lifecycleFor('outcome-unknown',
          'Editing acknowledgement did not match the active request.'))
        return finish('outcome-unknown')
      }

      return finish(completeAcceptedCommit(get, set, session, browsingSheetId, selectionWitness,
        projectionWitness, projectionRequest, transport.value.projection, input?.returnToSource))
    } catch (error) {
      // 异常也结束等待；原有锁和错误恢复规则不由后续编辑改写。
      finish('blocked')
      throw error
    }
  },
)

commitCellEditingAtom.debugLabel = 'spreadsheet.editing.commitCell'

/** Re-reads the visible projection from Rust to reconcile and release a settled unknown commit. */
export const reconcileCellEditingAtom = atom(
  null,
  async (get, set): Promise<EditingCommitOutcome> => {
    const ticket = get(activeEditingCommitTicketAtom)
    const lifecycle = get(editingCommitLifecycleBackingAtom)
    const progress = ticket ? ticketProgress.get(ticket) : undefined
    if (
      ticket === null ||
      lifecycle.status !== 'outcome-unknown' ||
      !progress?.settled ||
      progress.reconciling
    )
      return 'blocked'
    const visibleRequest = get(projectionSnapshotAtom).request
    if (visibleRequest?.kind !== 'visible-window') return 'blocked'

    progress.reconciling = true
    try {
      const refresh = await set(runVisibleProjectionAtom, {
        sheetId: visibleRequest.sheetId, window: visibleRequest.window,
        viewport: visibleRequest.viewport, reason: visibleRequest.reason, retainResult: true,
      })
      if (get(activeEditingCommitTicketAtom) !== ticket) return 'blocked'
      if (refresh.status === 'failed') {
        set(editingCommitLifecycleBackingAtom, lifecycleFor('outcome-unknown', refresh.error))
        return 'outcome-unknown'
      }
      set(resetFormulaReferenceStateAtom)
      set(editingSessionBackingAtom, createEditingSessionState())
      set(editingCommitLifecycleBackingAtom, lifecycleFor('ready'))
      set(keyboardModeAtom, 'navigation')
      set(activeEditingCommitTicketAtom, null)
      const memory = get(sheetViewsBackingAtom)
      if (memory.referenceBrowsing)
        set(sheetViewsBackingAtom, { ...memory, referenceBrowsing: false })
      return 'completed'
    } finally {
      progress.reconciling = false
    }
  },
)

reconcileCellEditingAtom.debugLabel = 'spreadsheet.editing.reconcileCell'
