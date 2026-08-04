// 一句话：引擎自持的隐藏行状态的读写。

import type {
  BackendMutationResult,
  ColumnFilterRule,
  HideRowsRequest,
  SetEvalHiddenRowsRequest,
  SheetHiddenStateRequest,
  SheetHiddenStateResult,
  UnhideRowsRequest,
} from '@einfach/spreadsheet-ui-core'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import type { WorkerBackendState } from './state'

export async function readSheetHiddenStateThroughWorker(
  state: WorkerBackendState,
  request: SheetHiddenStateRequest,
): Promise<SheetHiddenStateResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const [manualRows, filter] = await Promise.all([
    state.client.listHiddenRows!(sheet.idx),
    state.client.getFilter!(sheet.idx),
  ])
  return {
    kind: 'sheet-hidden-state',
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    manualRows,
    filterRows: filter.hiddenRows,
    // Wire shape is byte-identical to `ColumnFilterRule`; no mapping layer.
    filterRules: filter.rules as ColumnFilterRule[],
  }
}

/**
 * Engine hidden-row eval input (parity #23). Whole-set REPLACE of the
 * hidden-row set the SUBTOTAL 101-111 variants exclude for the request's
 * sheet. NOT a mutation — no exact ACK, no undo record, no revision bump
 * of its own: the engine's paired `hidden_epoch` bump marks the affected
 * 101-111 formulas dirty, and the worker forwards the resulting recompute
 * as `cellsDirty` (the standard content-change path). The push is
 * idempotent (repeated identical sets are safe) and resolves once the
 * worker ACKs so the provider can order a follow-up projection read after
 * the epoch bump has applied.
 */
export async function setEvalHiddenRowsThroughWorker(
  state: WorkerBackendState,
  request: SetEvalHiddenRowsRequest,
): Promise<void> {
  const sheet = await resolveSheet(state, request.sheetId)
  const rows: number[] = []
  for (const value of request.rows) {
    if (Number.isSafeInteger(value) && value >= 0) rows.push(value)
  }
  await state.client.setEvalHiddenRows(sheet.idx, rows)
}

/**
 * Engine-owned manual hidden rows — `hideRows` (design-engine-hidden-rows
 * E2, add rows to the manual set). Capability-gated by `engineHiddenState`
 * (same witness as `readSheetHiddenState`) so the TS worker's `false`
 * declaration withholds the port and UI-core falls back to the
 * `setEvalHiddenRows` whole-set push + `readSheetHiddenState` reconcile
 * path. The worker RPC resolves the engine-side `boolean` (whether anything
 * changed), then the adapter bumps the host revision and returns the
 * standard `BackendMutationResult` ACK so UI-core's strict acknowledgement
 * chain completes.
 */
export async function hideRowsThroughWorker(
  state: WorkerBackendState,
  request: HideRowsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const rows = request.rowIndices.filter((v) => Number.isSafeInteger(v) && v >= 0)
  await state.client.hideRows!(sheet.idx, rows)
  return {
    sheetId: request.sheetId,
    requestId: request.requestId ?? 0,
    revision: bumpRevision(state),
  }
}

/**
 * Engine-owned manual hidden rows — `unhideRows`. Symmetric twin of
 * `hideRowsThroughWorker`; see that function's doc for the capability
 * gate and ACK convention.
 */
export async function unhideRowsThroughWorker(
  state: WorkerBackendState,
  request: UnhideRowsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const rows = request.rowIndices.filter((v) => Number.isSafeInteger(v) && v >= 0)
  await state.client.unhideRows!(sheet.idx, rows)
  return {
    sheetId: request.sheetId,
    requestId: request.requestId ?? 0,
    revision: bumpRevision(state),
  }
}
