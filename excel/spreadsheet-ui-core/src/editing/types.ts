import type { ProjectionRequestId, SetCellInputRequest } from '../backend/types'
import type { CellCoord } from '../shared'

export type EditingInputSource = 'cell' | 'formula-bar' | 'keyboard' | 'paste'

/** Draft ownership only; asynchronous commit progress lives in EditingCommitLifecycleStatus. */
export type EditingSessionStatus = 'idle' | 'drafting'

export interface EditingSourceCell {
  readonly sheetId: string
  readonly cell: Readonly<CellCoord>
  readonly source: EditingInputSource
}

export interface EditingSessionState {
  readonly status: EditingSessionStatus
  readonly source: EditingSourceCell | null
  readonly draft: string
}

export interface EditingStartInput {
  sheetId: string
  cell: CellCoord
  draft: string
  source: EditingInputSource
}

export interface EditingDraftInput {
  draft: string
  source?: EditingInputSource
}

/** Set-cell request with the identity required by the editing transaction. */
export interface EditingCommitRequest extends SetCellInputRequest {
  readonly requestId: ProjectionRequestId
}

export type EditingCommitLifecycleStatus =
  | 'ready'
  | 'blocked'
  | 'pending'
  | 'outcome-unknown'
  | 'rejected'

export interface EditingCommitLifecycleState {
  readonly status: EditingCommitLifecycleStatus
  readonly error: string
}

export type EditingCommitOutcome = 'completed' | 'blocked' | 'rejected' | 'outcome-unknown'

/** Optional test/host override; normal React callers submit with no argument. */
export interface CommitCellEditingInput {
  readonly timeoutMs?: number
}
