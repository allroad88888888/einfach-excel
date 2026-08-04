// 一句话：AutoFill 的语义拒绝与结果未知两条出口。

import type {
  AutoFillMutationResult,
  FillRangeRequest,
  FillSeriesRequest,
} from '@einfach/spreadsheet-ui-core'
import { advanceAutoFillUnknownRevision } from './auto-fill-revision'
import { createBackendError } from './backend-error'
import {
  discardDeferredAutoFillContentChange,
  notifyContentChangeHandlersForAutoFillOutcome,
} from './content-change'
import { dropTransactionRecords } from './transaction-log'
import type { WorkerBackendState } from './state'

export function throwAutoFillOutcomeUnknown(
  state: WorkerBackendState,
  message: string,
): never {
  dropTransactionRecords(state)
  discardDeferredAutoFillContentChange(state)
  const nextRevision = advanceAutoFillUnknownRevision(state)
  // The native call may already have committed, so force every projection
  // consumer to refresh even when the worker failed to emit cellsDirty.
  notifyContentChangeHandlersForAutoFillOutcome(state)
  throw Object.assign(createBackendError('AUTO_FILL_OUTCOME_UNKNOWN', message), {
    outcome: 'unknown' as const,
    revision: nextRevision,
  })
}

export function throwAutoFillHistoryOutcomeUnknown(
  state: WorkerBackendState,
  action: 'undo' | 'redo',
  cause: unknown,
): never {
  const detail = cause instanceof Error ? cause.message : String(cause)
  throwAutoFillOutcomeUnknown(state, 
    `auto-fill ${action} replay failed after dispatch; workbook history was cleared because the replay outcome is unknown: ${detail}`,
  )
}

export function autoFillRejectionMessage(error: unknown): string | null {
  if (!(error instanceof Error)) return null
  const code = (error as Error & { code?: unknown }).code
  // `AUTO_FILL_TOO_LARGE` is a distinct wire code (parity with the
  // `AUTO_FILL_REJECTED` catch-all) for the engine's own size-budget
  // rejection — normally unreachable here because `prepareAutoFillWireRequest`
  // mirrors the same `MAX_AUTO_FILL_CELLS` cap and rejects before any RPC,
  // but it must still be treated as a legitimate semantic rejection
  // (not an unknown-outcome failure) if the two caps ever drift.
  return code === 'AUTO_FILL_REJECTED' || code === 'AUTO_FILL_TOO_LARGE' ? error.message : null
}

export function autoFillNotApplied(
  state: WorkerBackendState,
  request: FillRangeRequest | FillSeriesRequest,
  reason?: string,
): AutoFillMutationResult {
  const result = {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: state.revision,
    applied: false as const,
    historyTransactionCount: 0 as const,
    historyDisposition: 'none' as const,
    ...(reason === undefined ? {} : { notAppliedReason: reason }),
  }
  return result
}
