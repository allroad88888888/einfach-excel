// 一句话：把筛选规则交给引擎并镜像它算出的隐藏行。

import type { SetFilterSortRequest, SetFilterSortResult } from '@einfach/spreadsheet-ui-core'
import { cloneFilterSortState, filterSortHasEffect } from '@einfach/spreadsheet-ui-core'
import { createBackendError } from './backend-error'
import { filterSnapshotOverCap, filterSnapshotSheetChanged } from './filter-snapshot-cap'
import { FILTER_SORT_SOURCE_TOO_LARGE } from './limits'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { pushTransactionRecord } from './transaction-log'
import type { WorkerBackendState } from './state'

export async function setFilterSortThroughWorker(
  state: WorkerBackendState,
  request: SetFilterSortRequest,
): Promise<SetFilterSortResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const next = cloneFilterSortState({ rules: request.rules })

  // Excel-parity filter undo (2026-07-22): bracket the apply / clear with the
  // engine's whole-workbook filter snapshot so a CHANGED filter becomes one
  // undoable transaction. Reuses the E8 `filtersSnapshot` record + its
  // `restoreFilters` replay verbatim; only the trigger is new (the filter
  // mutation ITSELF, not a structural op that displaced it). Captured only
  // when the caller opted in AND the runtime can snapshot — Reapply passes
  // `recordHistory: false`, so it never brackets and never records.
  const wantsHistory =
    request.recordHistory === true && typeof state.client.snapshotFilters === 'function'
  const filtersBefore = wantsHistory ? await state.client.snapshotFilters!() : null

  let hiddenRowIndices: readonly number[]
  if (!filterSortHasEffect(next)) {
    state.filterSortStateBySheetId.delete(request.sheetId)
    state.filterHiddenRowsBySheetId.delete(request.sheetId)
    // Scan-free: drops the engine's rules AND derived rows, so SUBTOTAL stops
    // excluding rows that are visible again.
    await state.client.clearFilter!(sheet.idx)
    // Explicitly empty, never absent: "the rules hid nothing" is the answer
    // here, and UI core must clear its set on the strength of it.
    hiddenRowIndices = []
  } else {
    // The engine runs the predicate ONCE and commits both the rules and the
    // rows they hid; the refusal (if any) rides in the resolved value, never
    // a throw (`sortRange` convention). This REPLACES the host predicate scan
    // the adapter used to run — the engine reproduced it cell-for-cell
    // (verified at E3 over 7700 judgments) — and the separate eval-input
    // push, since `applyFilter` writes the engine's owned set itself.
    const report = await state.client.applyFilter!(sheet.idx, request.rules)
    if (!report.ok) {
      if (report.code === 'source-too-large') {
        throw createBackendError(
          FILTER_SORT_SOURCE_TOO_LARGE,
          report.message ??
            'filter/sort predicate source is too large; the filter was not applied',
        )
      }
      // invalid-sheet / mutation-during-custom-call / invalid-payload: none is
      // reachable from a compliant caller, so surface a structured backend
      // error rather than a fake ACK.
      throw createBackendError(
        'FILTER_REJECTED',
        report.message ?? `filter refused: ${report.code}`,
      )
    }
    state.filterSortStateBySheetId.set(request.sheetId, next)
    // Mirror the engine's answer for projection withholding + the structural
    // undo before/after images. This is a MIRROR of engine-owned state, not
    // an independently derived set — nothing here re-runs the predicate.
    state.filterHiddenRowsBySheetId.set(request.sheetId, new Set(report.hiddenRows))
    hiddenRowIndices = report.hiddenRows
  }

  // Record iff the caller asked AND the sheet's filter actually changed. The
  // whole-workbook snapshot before/after IS the ground truth for "will an
  // undo do anything", so a no-op apply / clear records on neither side and
  // leaves both redo stacks intact (the adapter mirrors UI-core's push-on-
  // change discipline). The adapter is the single decision-maker; UI core
  // pushes its paired entry off the `historyRecorded` verdict returned here.
  let historyRecorded = false
  if (filtersBefore !== null) {
    const filtersAfter = await state.client.snapshotFilters!()
    // A filter that hides tens of thousands of rows blows the whole-workbook
    // hidden-row budget (`WORKER_FILTER_SNAPSHOT_MAX`); this record's cell
    // images are null, so this is the ONLY place that cap can act. Over it the
    // filter still applies but is not recorded — observably identical to the
    // no-change branch below (historyRecorded stays false, no push, redo
    // stacks untouched, adapter and UI-core stay aligned because UI core only
    // pushes its paired entry when this verdict is true). Truncating instead
    // would restore a wrong hidden set on undo, so the record is dropped whole.
    if (
      filterSnapshotSheetChanged(filtersBefore, filtersAfter, sheet.idx) &&
      filterSnapshotOverCap(filtersBefore, filtersAfter) === null
    ) {
      pushTransactionRecord(state, {
        kind: 'filter.set',
        sheetIdx: sheet.idx,
        boundTransactionId: null,
        affectedRange: null,
        clearRange: null,
        // A filter mutation rewrites no cells — the record carries ONLY the
        // filter snapshot, exactly like a merge/unmerge record carries only
        // its overlay. `runHistoryTransaction` skips the (absent) cell replay
        // and restores the engine filter through `restoreFilters`.
        before: null,
        after: null,
        filtersSnapshot: {
          sheetId: request.sheetId,
          sheetIdx: sheet.idx,
          before: filtersBefore,
          after: filtersAfter,
        },
      })
      historyRecorded = true
    }
  }

  // The engine's epoch bump has already fired inside `applyFilter`/`clearFilter`,
  // so the revision minted now corresponds to the re-derived aggregates the
  // host will read off this ACK.
  return {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? bumpRevision(state),
    hiddenRowIndices,
    historyRecorded,
  }
}
