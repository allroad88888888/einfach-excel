// 一句话：把一次拖拽填充走完原生 AutoFill 事务。

import type {
  AutoFillMutationResult,
  FillRangeRequest,
  FillSeriesRequest,
} from '@einfach/spreadsheet-ui-core'
import type { AutoFillReportWire } from '../worker-protocol'
import {
  autoFillNotApplied,
  autoFillRejectionMessage,
  throwAutoFillOutcomeUnknown,
} from './auto-fill-outcome'
import {
  advanceAutoFillRevision,
  assertCurrentAutoFillRevision,
  assertUnchangedAutoFillEpoch,
  enqueueAutoFillMutation,
} from './auto-fill-revision'
import { isExpectedAutoFillReport, restoreAndVerifyAutoFillImage } from './auto-fill-verify'
import { prepareAutoFillWireRequest } from './auto-fill-wire'
import { createBackendError } from './backend-error'
import { autoFillIsSupported, runtimeSupports } from './capabilities'
import {
  discardDeferredAutoFillContentChange,
  flushDeferredAutoFillContentChange,
  flushRejectedAutoFillContentChange,
  runAutoFillNativeMutation,
} from './content-change'
import { WORKER_UNDO_STACK_CAP } from './limits'
import { resolveSheet } from './sheet-ops'
import { captureUndoImage, notUndoableRecord, pushTransactionRecord } from './transaction-log'
import type { WorkerTransactionRecord, WorkerUndoImage } from './transaction-record'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

export async function applyAutoFillThroughWorker(
  state: WorkerBackendState,
  request: FillRangeRequest | FillSeriesRequest,
): Promise<AutoFillMutationResult> {
  return enqueueAutoFillMutation(state, async () => {
    const sheet = await resolveSheet(state, request.sheetId)
    const { wire, writeRange } = prepareAutoFillWireRequest(sheet.idx, request)
    assertCurrentAutoFillRevision(state, request)
    const preflightRevision = state.revision
    if (!autoFillIsSupported(state)) {
      throw createBackendError(
        'UNSUPPORTED',
        'worker runtime does not advertise native auto-fill',
      )
    }
    if (writeRange === null) {
      // A copy whose source already equals its target is mechanically a
      // no-op. A non-copy series still needs the engine planner to validate
      // its seed values against the requested step/trend/list semantics.
      if (wire.series !== 'copy') {
        let report: AutoFillReportWire
        // With no write range the engine is performing semantic validation
        // only. Do not suppress dirty events here: any such event is an
        // independent mutation and must advance the live revision.
        try {
          report = await state.client.applyAutoFill!(wire)
        } catch (error) {
          const rejection = autoFillRejectionMessage(error)
          if (rejection !== null) {
            return autoFillNotApplied(state, request, rejection)
          }
          throwAutoFillOutcomeUnknown(state, 
            'native no-write auto-fill validation failed without a semantic-rejection witness; outcome is unknown',
          )
        }
        if (!isExpectedAutoFillReport(report, null)) {
          throwAutoFillOutcomeUnknown(state, 
            'native auto-fill returned a malformed no-write validation result',
          )
        }
      }
      return autoFillNotApplied(state, request)
    }

    // Revision witnesses cross MAX_SAFE_INTEGER as decimal strings, so an
    // unbounded number of independent dirty events cannot exhaust a fixed
    // numeric reserve between native dispatch and the success ACK.
    const sparseRange = toSparseRange(sheet.idx, writeRange)
    const undoCountBefore = state.undoRecords.length
    let before: WorkerUndoImage | null = null
    let diagnostic = ''
    try {
      if (!runtimeSupports(state, 'formatSnapshots')) {
        diagnostic =
          'runtime does not implement format snapshots; auto-fill is not undoable'
      } else {
        before = await captureUndoImage(state, sparseRange, {
          values: true,
          formats: true,
        })
      }
    } catch (error) {
      diagnostic = `auto-fill undo before-image snapshot failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    }

    // Snapshot RPCs are reads but cellsDirty may arrive while they are in
    // flight. Never dispatch a plan computed against an older epoch.
    assertUnchangedAutoFillEpoch(state, preflightRevision)

    let report: AutoFillReportWire
    try {
      report = await runAutoFillNativeMutation(state, sparseRange, () =>
        state.client.applyAutoFill!(wire),
      )
    } catch (error) {
      const rejection = autoFillRejectionMessage(error)
      if (rejection !== null) {
        flushRejectedAutoFillContentChange(state)
        return autoFillNotApplied(state, request, rejection)
      }
      throwAutoFillOutcomeUnknown(state, 
        'native auto-fill RPC failed after dispatch; commit outcome is unknown',
      )
    }

    if (!isExpectedAutoFillReport(report, writeRange)) {
      if (before !== null) {
        try {
          const rolledBack = await runAutoFillNativeMutation(state, sparseRange, () =>
            restoreAndVerifyAutoFillImage(state, sparseRange, before!),
          )
          if (rolledBack) {
            discardDeferredAutoFillContentChange(state)
            throw createBackendError(
              'INVALID_AUTO_FILL_REPORT',
              'native auto-fill returned a result that does not match the preflighted range; the captured image was restored',
            )
          }
        } catch (error) {
          if (
            error instanceof Error &&
            (error as Error & { code?: string }).code === 'INVALID_AUTO_FILL_REPORT'
          ) {
            throw error
          }
        }
      }
      throwAutoFillOutcomeUnknown(state, 
        'native auto-fill may have committed but its result could not be verified or rolled back',
      )
    }

    let after: WorkerUndoImage | null = null
    try {
      after = await captureUndoImage(state, sparseRange, {
        values: true,
        formats: true,
      })
    } catch (error) {
      diagnostic = `auto-fill redo after-image snapshot failed: ${
        error instanceof Error ? error.message : String(error)
      }`
    }
    const autoFillRecord: WorkerTransactionRecord =
      before !== null && after !== null
        ? {
            kind: 'range.fill',
            sheetIdx: sheet.idx,
            boundTransactionId: null,
            affectedRange: { ...writeRange },
            clearRange: sparseRange,
            before,
            after,
          }
        : notUndoableRecord(
            'range.fill',
            sheet.idx,
            writeRange,
            diagnostic || 'auto-fill snapshots were unavailable',
          )
    pushTransactionRecord(state, autoFillRecord)

    const expectedUndoCount = Math.min(
      undoCountBefore + 1,
      WORKER_UNDO_STACK_CAP,
    )
    if (
      state.undoRecords.length !== expectedUndoCount ||
      state.undoRecords[state.undoRecords.length - 1] !== autoFillRecord
    ) {
      throwAutoFillOutcomeUnknown(state, 
        'native auto-fill committed without exactly one backend transaction',
      )
    }
    const nextRevision = advanceAutoFillRevision(state)
    flushDeferredAutoFillContentChange(state)
    const historyDisposition =
      autoFillRecord.before !== null && autoFillRecord.after !== null
        ? 'undoable'
        : 'not-undoable'
    return {
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: nextRevision,
      applied: true,
      historyTransactionCount: 1,
      historyDisposition,
      affectedRange: { ...writeRange },
    }
  })
}

export function fillRangeThroughWorker(
  state: WorkerBackendState,
  request: FillRangeRequest,
): Promise<AutoFillMutationResult> {
  return applyAutoFillThroughWorker(state, request)
}

export function fillSeriesThroughWorker(
  state: WorkerBackendState,
  request: FillSeriesRequest,
): Promise<AutoFillMutationResult> {
  return applyAutoFillThroughWorker(state, request)
}
