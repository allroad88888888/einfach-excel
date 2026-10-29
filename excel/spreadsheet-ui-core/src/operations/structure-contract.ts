import type {
  BackendMutationResult,
  DeleteColumnsRequest,
  DeleteRowsRequest,
  InsertColumnsRequest,
  InsertRowsRequest,
  ProjectionRequestId,
  ProjectionRevision,
} from '../backend/types'
import type { HistoryEntryRecorder } from '../history'
import type {
  DeleteColumnsOperationIntent,
  DeleteRowsOperationIntent,
  InsertColumnsOperationIntent,
  InsertRowsOperationIntent,
} from './intent-types'

export type StructureOperationIntent =
  | InsertRowsOperationIntent
  | DeleteRowsOperationIntent
  | InsertColumnsOperationIntent
  | DeleteColumnsOperationIntent

export type StructureOperationRequest =
  | (InsertRowsRequest & { readonly requestId: ProjectionRequestId })
  | (DeleteRowsRequest & { readonly requestId: ProjectionRequestId })
  | (InsertColumnsRequest & { readonly requestId: ProjectionRequestId })
  | (DeleteColumnsRequest & { readonly requestId: ProjectionRequestId })

/** Framework-neutral effect port. Core never retains the adapter object. */
export interface StructureOperationControllerPort {
  insertRows?: (request: InsertRowsRequest) => Promise<BackendMutationResult>
  deleteRows?: (request: DeleteRowsRequest) => Promise<BackendMutationResult>
  insertColumns?: (request: InsertColumnsRequest) => Promise<BackendMutationResult>
  deleteColumns?: (request: DeleteColumnsRequest) => Promise<BackendMutationResult>
}

export type StructureOperationLifecycleStatus =
  | 'idle'
  | 'pending'
  | 'local-acknowledged'
  | 'refreshing'
  | 'completed'
  | 'refresh-failed'
  | 'rejected'
  | 'unsupported'
  | 'outcome-unknown'
  | 'stale'

export interface StructureOperationLifecycleState {
  readonly status: StructureOperationLifecycleStatus
  readonly operation: StructureOperationIntent['kind'] | null
  readonly sheetId: string | null
  readonly transactionId: string | null
  readonly requestId: ProjectionRequestId | null
  readonly acknowledgedRevision: ProjectionRevision | null
  readonly error: string
}

export type StructureOperationCommandOutcome =
  | 'completed'
  | 'refresh-failed'
  | 'rejected'
  | 'unsupported'
  | 'outcome-unknown'
  | 'stale'

export interface RunStructureOperationInput {
  readonly intent: StructureOperationIntent
  readonly source: StructureOperationControllerPort
  readonly refreshProjection: (sheetId: string) => Promise<void>
  /** Host capability guard retained by the immutable mutation ticket after ACK. */
  readonly historyEntryRecorder: HistoryEntryRecorder
  /** Mutation and refresh timeout. Defaults to `DEFAULT_STRUCTURE_OPERATION_TIMEOUT_MS`. */
  readonly timeoutMs?: number
}

export interface RetryStructureOperationRefreshInput {
  readonly refreshProjection: (sheetId: string) => Promise<void>
  /** Refresh-only retry timeout. Defaults to `DEFAULT_STRUCTURE_OPERATION_TIMEOUT_MS`. */
  readonly timeoutMs?: number
}

export const DEFAULT_STRUCTURE_OPERATION_TIMEOUT_MS = 15_000
export const STRUCTURE_OPERATION_REJECTED_ERROR =
  'Structure operation intent or refresh effect is invalid.'
export const STRUCTURE_OPERATION_UNSUPPORTED_ERROR =
  'Structure operation is unavailable because the workbook does not provide the required transport.'
export const STRUCTURE_OPERATION_ACKNOWLEDGEMENT_ERROR =
  'Structure operation acknowledgement did not exactly match the active ticket.'
export const STRUCTURE_OPERATION_OUTCOME_UNKNOWN_ERROR =
  'Structure operation result is unknown. Reload or reconcile workbook data ' +
  'before another structural mutation.'
export const STRUCTURE_OPERATION_HISTORY_ERROR =
  'Structure operation was acknowledged, but its history entry could not be recorded.'
