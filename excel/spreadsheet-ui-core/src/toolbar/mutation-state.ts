import { atom } from '@einfach/core'
import type { Atom } from '@einfach/core'
import type { HistoryEntryRecorder } from '../history'
import type {
  MergeRangeRequest,
  ProjectionRequestId,
  SetFormatRangeRequest,
  UnmergeRangeRequest,
} from '../backend/types'
import type { CellRange } from '../shared'
import type {
  ToolbarBackendMutationResult,
  ToolbarMutationIdentityPlan,
  ToolbarMutationLifecycleState,
  ToolbarMutationOperation,
  ToolbarMutationStep,
} from './types'

export const TOOLBAR_MUTATION_CAPABILITY_ERROR =
  'Toolbar mutation is unavailable because this workbook does not provide the required transport.'
export const TOOLBAR_MUTATION_ACKNOWLEDGEMENT_ERROR =
  'Toolbar mutation acknowledgement did not match the active request.'
export const TOOLBAR_MUTATION_OUTCOME_UNKNOWN_ERROR =
  'Toolbar mutation result is unknown. Reconcile workbook data before another mutation.'

export type CapturedToolbarMutationRequest =
  | Readonly<SetFormatRangeRequest>
  | Readonly<MergeRangeRequest>
  | Readonly<UnmergeRangeRequest>

export interface CapturedToolbarMutationStep {
  readonly kind: ToolbarMutationStep['kind']
  readonly requestId: ProjectionRequestId
  readonly range: Readonly<CellRange>
  readonly request: CapturedToolbarMutationRequest
  readonly execute: () => Promise<ToolbarBackendMutationResult>
}

export type ToolbarMutationHistoryKind = 'format.set' | 'range.merge' | 'range.unmerge'

export interface ToolbarMutationTicket {
  readonly sessionId: number
  readonly operation: ToolbarMutationOperation
  readonly sheetId: string
  readonly requestId: ProjectionRequestId
  readonly affectedRange: Readonly<CellRange>
  readonly steps: readonly CapturedToolbarMutationStep[]
  readonly historyKind: ToolbarMutationHistoryKind
  readonly refreshProjection: (sheetId: string) => Promise<void>
  readonly historyEntryRecorder: HistoryEntryRecorder
}

export const INITIAL_TOOLBAR_MUTATION_LIFECYCLE: ToolbarMutationLifecycleState = Object.freeze({
  status: 'ready',
  sessionId: 0,
  operation: null,
  sheetId: null,
  requestId: null,
  affectedRange: null,
  acknowledgedRevision: null,
  acknowledgedCount: 0,
  totalCount: 0,
  canRetryRefresh: false,
  error: '',
})

export const toolbarMutationLifecycleBackingAtom = atom<ToolbarMutationLifecycleState>(
  INITIAL_TOOLBAR_MUTATION_LIFECYCLE,
)
toolbarMutationLifecycleBackingAtom.debugLabel = 'spreadsheet.toolbar.mutationLifecycleBacking'

export const activeToolbarMutationTicketAtom = atom<ToolbarMutationTicket | null>(null)
activeToolbarMutationTicketAtom.debugLabel = 'spreadsheet.toolbar.activeMutationTicket'

/** Held until the currently executing raw transport/refresh promise has settled. */
export const toolbarMutationTransportLaneAtom = atom<ToolbarMutationTicket | null>(null)
toolbarMutationTransportLaneAtom.debugLabel = 'spreadsheet.toolbar.mutationTransportLane'

export const toolbarMutationSessionSequenceAtom = atom(0)
toolbarMutationSessionSequenceAtom.debugLabel = 'spreadsheet.toolbar.mutationSessionSequence'

export const toolbarMutationRequestSequenceAtom = atom(0)
toolbarMutationRequestSequenceAtom.debugLabel = 'spreadsheet.toolbar.mutationRequestSequence'

/** Read-only Core-owned mutation lifecycle; adapters render but never write it. */
export const toolbarMutationLifecycleAtom: Atom<ToolbarMutationLifecycleState> = atom((get) =>
  get(toolbarMutationLifecycleBackingAtom),
)
toolbarMutationLifecycleAtom.debugLabel = 'spreadsheet.toolbar.mutationLifecycle'

/** Pure safe-integer allocator used by both toolbar mutation identity lanes. */
export function nextToolbarMutationIdentity(sequence: number): number | null {
  if (!Number.isSafeInteger(sequence)) return null
  if (sequence >= 0) return sequence < Number.MAX_SAFE_INTEGER ? sequence + 1 : -1
  return sequence > Number.MIN_SAFE_INTEGER ? sequence - 1 : null
}

/** Atomically plans every identity before any private sequence is advanced. */
export function planToolbarMutationIdentities(
  sessionSequence: number,
  requestSequence: number,
  requestCount: number,
): ToolbarMutationIdentityPlan | null {
  if (!Number.isSafeInteger(requestCount) || requestCount <= 0) return null
  const sessionId = nextToolbarMutationIdentity(sessionSequence)
  if (sessionId === null) return null

  const requestIds: ProjectionRequestId[] = []
  let nextRequestSequence = requestSequence
  for (let index = 0; index < requestCount; index += 1) {
    const requestId = nextToolbarMutationIdentity(nextRequestSequence)
    if (requestId === null) return null
    requestIds.push(requestId)
    nextRequestSequence = requestId
  }

  return Object.freeze({
    sessionId,
    requestIds: Object.freeze(requestIds),
    requestSequence: nextRequestSequence,
  })
}
