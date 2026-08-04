// 一句话：行列结构变更端口。

import type {
  DeleteColumnsRequest,
  DeleteRowsRequest,
  InsertColumnsRequest,
  InsertRowsRequest,
  RemoveRowsExactRequest,
  RemoveRowsRequest,
} from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from '../capabilities'
import { removeRowsExactThroughWorker, removeRowsThroughWorker } from '../remove-rows'
import {
  deleteColumnsThroughWorker,
  deleteRowsThroughWorker,
  insertColumnsThroughWorker,
  insertRowsThroughWorker,
} from '../structural'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createStructurePorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'insertRows' | 'deleteRows' | 'insertColumns' | 'deleteColumns' | 'removeRows' | 'removeRowsExact'
> {
  const insertRows = (request: InsertRowsRequest) => insertRowsThroughWorker(state, request)
  const deleteRows = (request: DeleteRowsRequest) => deleteRowsThroughWorker(state, request)
  const insertColumns = (request: InsertColumnsRequest) =>
    insertColumnsThroughWorker(state, request)
  const deleteColumns = (request: DeleteColumnsRequest) =>
    deleteColumnsThroughWorker(state, request)
  const removeRows = (request: RemoveRowsRequest) => removeRowsThroughWorker(state, request)
  const removeRowsExact = (request: RemoveRowsExactRequest) =>
    removeRowsExactThroughWorker(state, request)

  return {
    get insertRows() {
      return runtimeSupports(state, 'structuralEdits') ? insertRows : undefined
    },

    get deleteRows() {
      return runtimeSupports(state, 'structuralEdits') ? deleteRows : undefined
    },

    get insertColumns() {
      return runtimeSupports(state, 'structuralEdits') ? insertColumns : undefined
    },

    get deleteColumns() {
      return runtimeSupports(state, 'structuralEdits') ? deleteColumns : undefined
    },

    /**
     * Wave 7.5 Remove Duplicates port. The worker protocol does not have
     * a dedicated batched `removeRows` / `deleteRowsBatch` RPC — the Rust
     * `Workbook` only exposes contiguous-band `delete_row(at, count)`.
     * Audit D-10 (FIXED at the band level): we group the descending row
     * list into contiguous bands and issue ONE `deleteRows(start, count)`
     * RPC per band — the common remove-duplicates shape (clustered rows)
     * collapses to a handful of round-trips instead of one per row.
     * Fully scattered rows still cost one RPC per (single-row) band.
     *
     * TODO(einfach-excel-core#batch-delete-rows): when the Rust side
     * grows a batched primitive (`delete_rows_batch(indices: &[u32])`),
     * switch to a single RPC so the band loop below can become atomic.
     * The surface contract here will not change.
     *
     * Atomicity caveat (HIGH #5): because each band is its own RPC, a
     * mid-loop failure leaves the workbook with a partial deletion that
     * we cannot roll back from this side. Each band RPC is assumed
     * atomic engine-side (one `delete_row(at, count)` call). We surface
     * partial failure by counting committed deletes and re-throwing an
     * Error that wraps the underlying rejection AND carries
     * `removedRows` so the caller can record an accurate (partial)
     * history entry before re-prompting the user. The revision is still
     * bumped because the workbook IS dirty.
     *
     * Empty input is a no-op: no RPC, no revision bump, no history-side
     * effect, so accidentally confirming with zero duplicates leaves the
     * workbook entirely untouched.
     */
    get removeRows() {
      return runtimeSupports(state, 'structuralEdits') ? removeRows : undefined
    },

    get removeRowsExact() {
      // Two witnesses must agree: the host's explicit opt-in AND the
      // runtime's own structural-edit declaration.
      return state.options.removeRowsExactCapability === 'worker-engine-delete-rows' &&
        runtimeSupports(state, 'structuralEdits')
        ? removeRowsExact
        : undefined
    },
  }
}
