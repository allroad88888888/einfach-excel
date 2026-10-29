import type {
  AutoFillMutationResult,
  BackendMutationResult,
  FillRangeRequest,
  ImportCellsRequest,
  RangeProjectionResult,
  ResolveDataEdgeRequest,
  ResolveDataEdgeResult,
  SetCellInputRequest,
} from '../backend/types'
import type { ContentMutationBlockReason } from '../editing/mutation-gateway'
import type { HistoryEntryRecorder } from '../history'
import type { CellRange, SheetRef } from '../shared'
import type { FillSeriesRequest } from './types'

export const MAX_UI_FILL_FALLBACK_CELLS = 200

export type AutoFillDirection = 'up' | 'down' | 'left' | 'right'

export interface AutoFillIntent extends SheetRef {
  sourceRange: CellRange
  targetRange: CellRange
  direction: AutoFillDirection
  copyOnly?: boolean
}

/**
 * Framework adapter consumed by the shared command. Range reads deliberately
 * stay behind this port so a host can keep its projection request lane and
 * stale-result arbitration; all fill decisions remain in UI core.
 */
export interface AutoFillControllerPort {
  readRangeProjection(
    sheetId: string,
    range: Readonly<CellRange>,
  ): Promise<RangeProjectionResult | null>
  fillSeries?(request: FillSeriesRequest): Promise<AutoFillMutationResult>
  fillRange?(request: FillRangeRequest): Promise<AutoFillMutationResult>
  importCells?(request: ImportCellsRequest): Promise<BackendMutationResult>
  setCellInput(request: SetCellInputRequest): Promise<BackendMutationResult>
  resolveDataEdge?(request: ResolveDataEdgeRequest): Promise<ResolveDataEdgeResult>
}

export interface AutoFillCommandBase {
  source: AutoFillControllerPort
  refreshProjection(sheetId: string): Promise<void>
  /** Host guard captured with the mutation ticket after a backend ACK. */
  historyEntryRecorder: HistoryEntryRecorder
}

export interface RunAutoFillIntentInput extends AutoFillCommandBase {
  entrypoint: 'fill-handle'
  intent: AutoFillIntent
}

export interface RunAutoFillCommandInput extends AutoFillCommandBase, SheetRef {
  entrypoint: 'fill-command'
  selectionRange: CellRange
  direction: AutoFillDirection
}

export interface RunAutoFillDoubleClickInput extends AutoFillCommandBase, SheetRef {
  entrypoint: 'double-click'
  sourceRange: CellRange
  bounds: {
    rowCount: number
    colCount: number
  }
}

export type RunAutoFillInput =
  | RunAutoFillIntentInput
  | RunAutoFillCommandInput
  | RunAutoFillDoubleClickInput

export interface RetryAutoFillRefreshInput {
  refreshProjection(sheetId: string): Promise<void>
}

export type AutoFillMutationPath = 'fill-series' | 'fill-range' | 'import-cells' | 'set-cell-input'

export type AutoFillNoOpReason =
  | 'no-write-range'
  | 'sheet-boundary'
  | 'no-guide'
  | 'guide-ended'
  | 'backend-no-op'

export type AutoFillBlockedReason =
  | ContentMutationBlockReason
  | 'busy'
  | 'active-filter'
  | 'selection-mismatch'
  | 'active-sheet-mismatch'
  | 'missing-data-edge-capability'

export type AutoFillUnknownReason =
  | 'transport-rejected'
  | 'invalid-acknowledgement'
  | 'history-rejected'
  | 'committed-stale'

export type AutoFillOutcome =
  | {
      status: 'completed'
      path: AutoFillMutationPath
      affectedRange: Readonly<CellRange>
      historyEntries: number
      committedStale?: true
    }
  | { status: 'no-op'; reason: AutoFillNoOpReason }
  | { status: 'blocked'; reason: AutoFillBlockedReason }
  | { status: 'unsupported'; reason: 'fallback-cell-limit' }
  | { status: 'stale' }
  | { status: 'failed'; phase: 'read' | 'data-edge' }
  | {
      status: 'outcome-unknown'
      path: AutoFillMutationPath
      reason: AutoFillUnknownReason
    }
  | { status: 'refresh-failed'; path: AutoFillMutationPath }
