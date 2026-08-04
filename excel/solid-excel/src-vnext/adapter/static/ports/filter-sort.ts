// 一句话：筛选与排序端口。

import type {
  SetFilterSortRequest,
  SetFilterSortResult,
  SortRangeRequest,
  SortRangeResult,
} from '@einfach/spreadsheet-ui-core'
import { cloneFilterSortState, filterSortHasEffect, keyFor } from '@einfach/spreadsheet-ui-core'
import { filterHiddenRowsFromDisplayRows } from '../../filter-hidden-rows'
import type { EvalCellLookup } from '../../static-formula-eval'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import { buildFilterSortDisplayRows, getMaxSourceRow } from '../filter-sort-rows'
import { evalHiddenRowsForSheet, filterHiddenRowsForSheet } from '../hidden-rows'
import type { StateDelta } from '../history-delta'
import { STATIC_BACKEND_UNDO_CAP } from '../history-delta'
import { mutationResult } from '../mutation-result'
import { nextRevisionOrThrow } from '../revision'
import { applyStaticSortRange } from '../sort-range'
import type { StaticBackendState } from '../state'
import { getOrCreateSheetCells } from '../state'
import { makeStructuredRefResolver } from '../tables/structured-ref'

/** True when two nullable number sets hold exactly the same members. */
function sameNumberSet(left: Set<number> | null, right: Set<number> | null): boolean {
  const leftSize = left?.size ?? 0
  const rightSize = right?.size ?? 0
  if (leftSize !== rightSize) return false
  if (leftSize === 0) return true
  for (const value of left!) {
    if (!right!.has(value)) return false
  }
  return true
}

export function createFilterSortPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'setFilterSort' | 'sortRange'> {
  return {
    /**
     * Applying the rules also SNAPSHOTS the filter-hidden row set
     * (`design-filter-hidden-rows` §4.2, slice S4). That set is what makes
     * `SUBTOTAL(1-11)` and `SUBTOTAL(101-111)` stop counting filtered-out rows
     * — Excel's behaviour, and previously impossible here because the
     * evaluator had no idea a filter existed.
     *
     * The scan is the SAME one the projection already runs
     * (`buildFilterSortDisplayRows` over the full sheet extent); the hidden
     * set is its complement, so the two can never disagree about which rows a
     * rule removed. Snapshot, not live: taken here and not re-derived per
     * read, which is both Excel's model (`Data → Reapply`) and the worker
     * adapter's push point, so the two hosts stay observationally identical.
     */
    async setFilterSort(request: SetFilterSortRequest): Promise<SetFilterSortResult> {
      const nextRevision = nextRevisionOrThrow(state.revision)
      const next = cloneFilterSortState({ rules: request.rules })
      // Excel-parity filter undo (2026-07-22): capture the before-image so a
      // CHANGED apply/clear can be recorded as an undoable delta. Cheap clones
      // of one sheet's rules + derived hidden set — the twin of the worker's
      // `snapshotFilters` bracket.
      const beforeRules = state.filterSortBySheetId.get(request.sheetId) ?? null
      const beforeRulesImage = beforeRules ? cloneFilterSortState(beforeRules) : null
      const beforeHidden = state.filterHiddenRowsBySheetId.get(request.sheetId)
      const beforeHiddenImage = beforeHidden ? new Set(beforeHidden) : null

      let hiddenRowIndices: readonly number[] = []
      if (filterSortHasEffect(next)) {
        state.filterSortBySheetId.set(request.sheetId, next)
        const sheetCells = getOrCreateSheetCells(state, request.sheetId)
        const lookup: EvalCellLookup = {
          get(row: number, col: number) {
            return sheetCells.get(keyFor(row, col))
          },
          resolveStructuredRef: makeStructuredRefResolver(state, request.sheetId),
          hiddenRows: evalHiddenRowsForSheet(state, request.sheetId),
          // Deliberately the PREVIOUS filter set, exactly like the worker
          // (whose engine still holds the old set while the new scan runs):
          // a predicate column holding a SUBTOTAL reads the pre-apply value,
          // which keeps the derivation non-circular on both hosts.
          filterHiddenRows: filterHiddenRowsForSheet(state, request.sheetId),
        }
        const displayRows = buildFilterSortDisplayRows(sheetCells, lookup, next)
        const hidden = filterHiddenRowsFromDisplayRows(displayRows, getMaxSourceRow(sheetCells) + 1)
        hiddenRowIndices = hidden
        if (hidden.length > 0) {
          state.filterHiddenRowsBySheetId.set(request.sheetId, new Set(hidden))
        } else {
          state.filterHiddenRowsBySheetId.delete(request.sheetId)
        }
      } else {
        state.filterSortBySheetId.delete(request.sheetId)
        // Clearing the rules must clear the derived set too, or SUBTOTAL would
        // keep excluding rows that are visible again.
        state.filterHiddenRowsBySheetId.delete(request.sheetId)
      }
      state.revision = nextRevision

      // Record iff the caller opted in AND the filter actually changed. A no-op
      // apply/clear records nothing and leaves the redo stack intact — the same
      // "identity is not an undo step" discipline the worker applies — so the
      // host↔backend stacks stay aligned entry-for-entry. Self-contained delta
      // (not the `pendingDelta` recorder path) because the before-image was
      // captured above, before the mutation overwrote it.
      const afterRules = state.filterSortBySheetId.get(request.sheetId) ?? null
      const afterHidden = state.filterHiddenRowsBySheetId.get(request.sheetId) ?? null
      const changed =
        JSON.stringify(beforeRulesImage?.rules ?? null) !==
          JSON.stringify(afterRules?.rules ?? null) ||
        !sameNumberSet(beforeHiddenImage, afterHidden)
      let historyRecorded = false
      if (request.recordHistory === true && changed) {
        const delta: StateDelta = {
          sheetDeltas: new Map([
            [
              request.sheetId,
              { filter: { rules: beforeRulesImage, hiddenRows: beforeHiddenImage } },
            ],
          ]),
        }
        state.undoStack.push(delta)
        if (state.undoStack.length > STATIC_BACKEND_UNDO_CAP) state.undoStack.shift()
        // A new undoable mutation invalidates forward history, mirroring the
        // worker's `pushTransactionRecord` and UI-core's `pushHistoryAtom`.
        state.redoStack = []
        historyRecorded = true
      }

      // The set travels back to UI core on the ACK, where it becomes the
      // canonical answer for rendering, navigation and sort exclusion — one
      // scan, three consumers, no second derivation to drift from this one.
      return { ...mutationResult(request, state.revision), hiddenRowIndices, historyRecorded }
    },
    async sortRange(request: SortRangeRequest): Promise<SortRangeResult> {
      return applyStaticSortRange(state, request)
    },
  }
}
