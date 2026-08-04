// 一句话：隐藏行列状态端口。

import type {
  ColumnFilterRule,
  SetEvalHiddenRowsRequest,
  SheetHiddenStateRequest,
  SheetHiddenStateResult,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import {
  applyHiddenIndexMutationPlan,
  preflightHiddenIndexMutation,
} from '../hidden-index-mutation'
import type { StaticBackendState } from '../state'

export function createHiddenStatePorts(
  state: StaticBackendState,
): Pick<
  StaticSpreadsheetBackend,
  'hideRows' | 'unhideRows' | 'hideColumns' | 'unhideColumns' | 'setEvalHiddenRows' | 'readSheetHiddenState'
> {
  return {
    async hideRows(request) {
      const plan = preflightHiddenIndexMutation(state, request)
      if (plan.status === 'apply') {
        applyHiddenIndexMutationPlan(state, request.sheetId, plan)
      }
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    async unhideRows(request) {
      const plan = preflightHiddenIndexMutation(state, request)
      if (plan.status === 'apply') {
        applyHiddenIndexMutationPlan(state, request.sheetId, plan)
      }
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    async hideColumns(request) {
      const plan = preflightHiddenIndexMutation(state, request)
      if (plan.status === 'apply') {
        applyHiddenIndexMutationPlan(state, request.sheetId, plan)
      }
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    async unhideColumns(request) {
      const plan = preflightHiddenIndexMutation(state, request)
      if (plan.status === 'apply') {
        applyHiddenIndexMutationPlan(state, request.sheetId, plan)
      }
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    /**
     * SUBTOTAL 101-111 hidden-row evaluation input (parity #23,
     * design-excel-table §6.1). Retained as a port for surface parity with the
     * WASM engine (which cannot drop the export — INV-4 fingerprints it as
     * permanent baggage), but since the hidden-row sink-down (E7) it writes the
     * ONE `hiddenRowsBySheetId` store, exactly as the WASM engine's
     * `set_eval_hidden_rows` writes the one owned `Sheet::hidden_rows`. There is
     * no longer a separate eval lane to union in.
     *
     * Whole-set REPLACE: an empty set clears the sheet. Out-of-range and
     * duplicate rows are harmless — the evaluator only tests membership. Not
     * undoable and does not bump the revision.
     */
    setEvalHiddenRows(request: SetEvalHiddenRowsRequest): void {
      const rows = request.rows.filter((row) => Number.isSafeInteger(row) && row >= 0)
      if (rows.length === 0) {
        state.hiddenRowsBySheetId.delete(request.sheetId)
        return
      }
      state.hiddenRowsBySheetId.set(request.sheetId, new Set(rows))
    },
    /**
     * Whole-sheet hidden-state hydration read (design-engine-hidden-rows §4.2),
     * the twin of the worker's `readSheetHiddenStateThroughWorker`. UI core
     * re-hydrates its render caches from this after an undo/redo: this backend's
     * own `restoreFullSheet` already put the manual-hidden and FILTER-hidden
     * sets (and the filter rules) back on the structural transaction, so this
     * read reports the restored authoritative sets. Manual COLUMNS are omitted —
     * this backend, like the WASM engine, has nothing authoritative to say about
     * hidden columns (§8), which stay UI-core canonical.
     */
    async readSheetHiddenState(request: SheetHiddenStateRequest): Promise<SheetHiddenStateResult> {
      const manualRows = [...(state.hiddenRowsBySheetId.get(request.sheetId) ?? [])].sort(
        (left, right) => left - right,
      )
      const filterRows = [...(state.filterHiddenRowsBySheetId.get(request.sheetId) ?? [])].sort(
        (left, right) => left - right,
      )
      const filterRules = (state.filterSortBySheetId.get(request.sheetId)?.rules ??
        []) as readonly ColumnFilterRule[]
      return {
        kind: 'sheet-hidden-state',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? state.revision,
        manualRows,
        filterRows,
        filterRules,
      }
    },
  }
}
