import type { ProjectionRevision } from '../backend/types'
import type { SelectionAuthorityReceipt, SelectionAuthorityWitness, SelectionState } from '../selection'
import type { CellRange, SpreadsheetError } from '../shared'
import type { WorkspaceActiveSheetAuthorityWitness } from '../workspace'
import type {
  FindMatch, FindReplaceOperationAction, FindReplaceOperationDiagnosticStatus, FindReplaceQuery,
  FindReplaceRefreshRecoveryPhase, FindReplaceTarget, ReplaceMatchesRequest, ReplaceMatchesResult,
  RunFindReplaceMutationInput, RunFindReplaceRefreshRecoveryInput, SearchRangeRequest,
} from './types'

export interface SearchTicket {
  readonly sessionId: number
  readonly requestId: number
  readonly request: Readonly<SearchRangeRequest>
  readonly workspaceSheetId: string
  readonly workspaceWitness: WorkspaceActiveSheetAuthorityWitness
  readonly selection: Readonly<SelectionState>
  readonly selectionRange: Readonly<CellRange>
  readonly selectionWitness: SelectionAuthorityWitness
}

export type TicketedFindMatch = Omit<FindMatch, 'target'> & { readonly target: FindReplaceTarget | null }

export interface SearchResultTicket {
  readonly search: SearchTicket
  readonly revision: ProjectionRevision | undefined
  readonly matches: readonly TicketedFindMatch[]
  readonly totalCount: number
}

export interface OwnedFocus { readonly searchRequestId: number; readonly receipt: SelectionAuthorityReceipt }

export interface PendingMutation {
  readonly operationId: string
  readonly requestId: number
  readonly action: FindReplaceOperationAction
  readonly requestedCount: number
  readonly request: Readonly<ReplaceMatchesRequest>
  readonly resultTicket: SearchResultTicket
  readonly dispatched: boolean
}

export interface RefreshRecoveryBase {
  readonly status: 'required' | 'refreshing'
  readonly operationId: string
  readonly phase: FindReplaceRefreshRecoveryPhase
  readonly mutationRequest: Readonly<ReplaceMatchesRequest>
  readonly sourceSearch: SearchTicket
  readonly error: SpreadsheetError | null
}

export type RefreshRecoveryInternal = RefreshRecoveryBase & (
  | { readonly kind: 'acknowledged'; readonly mutationResult: Readonly<ReplaceMatchesResult> }
  | { readonly kind: 'outcome-unknown'; readonly phase: 'search'; readonly mutationResult: null }
)

export interface FindReplaceSessionState {
  readonly open: boolean
  readonly sessionId: number
  readonly activeSearchTicket: SearchTicket | null
  readonly resultTicket: SearchResultTicket | null
  readonly cursorOwnerTicket: SearchTicket | null
  readonly compatibilityCursor: boolean
  readonly pendingMutation: PendingMutation | null
  readonly recovery: RefreshRecoveryInternal | null
  readonly ownedFocus: OwnedFocus | null
  readonly availabilityError: SpreadsheetError | null
  readonly authorityUnavailable: boolean
}

export interface FindReplaceReconciliationTarget {
  readonly sheetId: string
  readonly range: Readonly<CellRange>
  readonly query: Readonly<FindReplaceQuery>
}

export interface FindReplaceOperationAttempt {
  readonly operationId: string
  readonly requestedCount: number
  readonly status: FindReplaceOperationDiagnosticStatus
  readonly reconciled: boolean
  readonly target: FindReplaceReconciliationTarget
}

export interface MutationPreparation {
  readonly ticket: PendingMutation
  readonly replaceMatches: NonNullable<RunFindReplaceMutationInput['replaceMatches']>
  readonly searchRange: NonNullable<RunFindReplaceMutationInput['searchRange']>
  readonly acceptAcknowledgedResult: RunFindReplaceMutationInput['acceptAcknowledgedResult']
  readonly timeoutMs: number
}

export interface RefreshPorts {
  readonly searchRange: NonNullable<RunFindReplaceRefreshRecoveryInput['searchRange']>
  readonly acceptAcknowledgedResult: RunFindReplaceRefreshRecoveryInput['acceptAcknowledgedResult']
  readonly timeoutMs: number
}

export type TransportOutcome<T> =
  | { readonly kind: 'fulfilled'; readonly value: T }
  | { readonly kind: 'rejected'; readonly error: unknown }
  | { readonly kind: 'timeout' }

export const INITIAL_SESSION: Readonly<FindReplaceSessionState> = Object.freeze({
  open: false, sessionId: 0, activeSearchTicket: null, resultTicket: null,
  cursorOwnerTicket: null, compatibilityCursor: false, pendingMutation: null,
  recovery: null, ownedFocus: null, availabilityError: null, authorityUnavailable: false,
})
