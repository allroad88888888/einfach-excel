// 一句话：把一次结构性变更录成一条可撤销事务。

import type { HistoryEntryKind } from '@einfach/spreadsheet-ui-core'
import { cloneRange } from '@einfach/spreadsheet-ui-core'
import type { SparseCellWire, SparseRangeWire } from '../worker-protocol'
import { filterSnapshotOverCap } from './filter-snapshot-cap'
import {
  FULL_SHEET_INDEX_BOUND,
  WORKER_FILTER_SNAPSHOT_MAX,
  WORKER_STRUCTURAL_SNAPSHOT_MAX,
} from './limits'
import { notUndoableRecord, pushTransactionRecord } from './transaction-log'
import type { WorkerWorkbookBackendSheet } from './types'
import type { WorkerBackendState } from './state'

/**
 * Record one structural mutation (insert/delete rows/columns,
 * removeRows). Design point B: the before-image must be the FULL-SHEET
 * non-empty snapshot — `#REF!` sentinel rewrites are irreversible — and
 * a sheet whose non-empty count exceeds `WORKER_STRUCTURAL_SNAPSHOT_MAX`
 * degrades the record to not-undoable (never a truncated snapshot).
 * Engine structural shifts move cells and formulas only (formats and
 * dimension maps are not part of the sparse image; formats are not
 * shifted by the engine, and sizes are UI-core canonical view facts),
 * so the image is values/formulas only.
 */
export async function recordStructuralMutation<T>(state: WorkerBackendState, spec: {
  kind: HistoryEntryKind
  sheet: WorkerWorkbookBackendSheet
  /** Host-overlay key: the #04 merge before/after images ride along the record. */
  sheetId: string
  execute: () => Promise<T>
}): Promise<T> {
  const fullRange: SparseRangeWire = {
    sheet: spec.sheet.idx,
    startRow: 0,
    startCol: 0,
    endRow: FULL_SHEET_INDEX_BOUND,
    endCol: FULL_SHEET_INDEX_BOUND,
  }
  let before: SparseCellWire[] | null = null
  let diagnostic = ''
  try {
    const nonEmpty = await state.client.listNonEmpty()
    let count = 0
    for (const ref of nonEmpty) {
      if (ref.sheet === spec.sheet.idx) count += 1
    }
    if (count > WORKER_STRUCTURAL_SNAPSHOT_MAX) {
      diagnostic =
        `structural before-image needs ${count} non-empty cells but the cap is ` +
        `${WORKER_STRUCTURAL_SNAPSHOT_MAX}; the operation is not undoable`
    } else {
      before = await state.client.snapshotRangeSparse(fullRange)
      if (before.length > WORKER_STRUCTURAL_SNAPSHOT_MAX) {
        diagnostic =
          `structural before-image produced ${before.length} cells over the cap ` +
          `${WORKER_STRUCTURAL_SNAPSHOT_MAX}; the operation is not undoable`
        before = null
      }
    }
  } catch (error) {
    diagnostic = `structural undo snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
    before = null
  }
  // #04 side payload: `execute` remaps the merge overlay right after
  // the engine shift ACKs, so the before-image is captured here and
  // the after-image post-execute. Pure adapter memory — no RPC, never
  // a reason to degrade the record.
  const mergeBefore = (state.mergeRangesBySheetId.get(spec.sheetId) ?? []).map(cloneRange)
  // E8 filter undo: when the mutated sheet has an active filter, bracket the
  // engine's whole-workbook filter snapshot around the shift. `execute`
  // self-displaces the engine's OWNED filter (rules + derived hidden set); a
  // cell-level undo replay does NOT re-shift it, so undo REPLACES it back
  // through `restoreFilters`. This supersedes the E7 adapter-memory before/
  // after array + `setEvalFilterHiddenRows` re-push.
  const sheetHasFilter = state.filterSortStateBySheetId.has(spec.sheetId)
  const filtersBefore =
    sheetHasFilter && typeof state.client.snapshotFilters === 'function'
      ? await state.client.snapshotFilters()
      : null
  const result = await spec.execute()
  const mergeAfter = (state.mergeRangesBySheetId.get(spec.sheetId) ?? []).map(cloneRange)
  const filtersAfter =
    filtersBefore !== null && typeof state.client.snapshotFilters === 'function'
      ? await state.client.snapshotFilters()
      : null
  const mergeOverlay =
    mergeBefore.length > 0 || mergeAfter.length > 0
      ? { sheetId: spec.sheetId, before: mergeBefore, after: mergeAfter }
      : undefined
  const filtersSnapshot =
    filtersBefore !== null && filtersAfter !== null
      ? {
          sheetId: spec.sheetId,
          sheetIdx: spec.sheet.idx,
          before: filtersBefore,
          after: filtersAfter,
        }
      : undefined
  if (before === null) {
    pushTransactionRecord(state, notUndoableRecord(spec.kind, spec.sheet.idx, null, diagnostic))
    return result
  }
  // The filter side payload has its OWN budget (`WORKER_FILTER_SNAPSHOT_MAX`)
  // that no cell cap covers — here it rides beside a cell image sized
  // independently. If the whole-workbook hidden-row image blows it, the WHOLE
  // record must degrade, not just its filter leg: the engine self-shifted its
  // filter forward on `execute`, and replaying the cells without restoring the
  // filter would strand it (the exact half-state E8 exists to prevent).
  if (filtersBefore !== null && filtersAfter !== null) {
    const filtersExcess = filterSnapshotOverCap(filtersBefore, filtersAfter)
    if (filtersExcess !== null) {
      pushTransactionRecord(state, 
        notUndoableRecord(
          spec.kind,
          spec.sheet.idx,
          null,
          `filter undo snapshot needs ${filtersExcess} hidden-row indices but the cap is ` +
            `${WORKER_FILTER_SNAPSHOT_MAX} per image; the operation is not undoable`,
        ),
      )
      return result
    }
  }
  let after: SparseCellWire[] | null = null
  try {
    after = await state.client.snapshotRangeSparse(fullRange)
    if (after.length > WORKER_STRUCTURAL_SNAPSHOT_MAX) {
      diagnostic =
        `structural after-image produced ${after.length} cells over the cap ` +
        `${WORKER_STRUCTURAL_SNAPSHOT_MAX}; the operation degraded to not-undoable`
      after = null
    }
  } catch (error) {
    diagnostic = `structural redo snapshot failed: ${
      error instanceof Error ? error.message : String(error)
    }`
  }
  pushTransactionRecord(state, 
    after !== null
      ? {
          kind: spec.kind,
          sheetIdx: spec.sheet.idx,
          boundTransactionId: null,
          affectedRange: null,
          clearRange: fullRange,
          before: { cells: before, format: null },
          after: { cells: after, format: null },
          ...(mergeOverlay ? { mergeOverlay } : {}),
          ...(filtersSnapshot ? { filtersSnapshot } : {}),
        }
      : notUndoableRecord(spec.kind, spec.sheet.idx, null, diagnostic),
  )
  return result
}
