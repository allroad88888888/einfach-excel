// 一句话：引擎物理排序的闸门、事务与拒绝映射。

import type {
  ProjectionRevision,
  SortRangeRejectedResult,
  SortRangeRejectionCode,
  SortRangeRequest,
  SortRangeResult,
} from '@einfach/spreadsheet-ui-core'
import { normalizeRange } from '@einfach/spreadsheet-ui-core'
import type { SortRangePayloadWire, SortRangeReportWire } from '../worker-protocol'
import { MAX_SORT_SOURCE_CELLS } from './limits'
import { rangesIntersect } from './range-overlap'
import { recordCellMutation } from './record-cell-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { normalizeSortRejectionCode } from './sort-rejection'
import { toSortRangeBounds } from './wire-range'
import type { WorkerBackendState } from './state'

/**
 * Engine physical sort (design-engine-sort S4, parity #29). The engine
 * owns the reorder (`client.sortRange`); the adapter contributes the two
 * authority gates the engine cannot enforce, wraps the RPC in ONE
 * host-orchestrated undo transaction, and converts a structured engine
 * reject into a not-applied result instead of rejecting the promise.
 *
 * Flow:
 *  1. Source-size cap (fail-closed, NO RPC): reject before any read /
 *     RPC / undo record / revision bump if the range area exceeds
 *     `MAX_SORT_SOURCE_CELLS`.
 *  2. Merge authority gate (design §5.2): the engine has no merge model,
 *     so the adapter — sole holder of the registry — rejects a sort
 *     intersecting any merged range before dispatch.
 *  3. `recordCellMutation('range.sort')` wraps the RPC: range sparse +
 *     format before-image → `client.sortRange` → after-image for redo,
 *     ONE record. `bumpRevision` runs only after a successful sort.
 *  4. A `SORT_REJECTED` throws inside `execute`, so `recordCellMutation`
 *     pushes NO record and never bumps; the throw is caught here and the
 *     engine's `detail` becomes the structured not-applied result.
 */
export function sortRejectedResult(
  state: WorkerBackendState,
  request: SortRangeRequest,
  code: SortRangeRejectionCode,
  message: string,
  anchor?: string,
): SortRangeRejectedResult {
  return {
    kind: 'sort-range-not-applied',
    sheetId: request.sheetId,
    applied: false,
    code,
    ...(anchor === undefined ? {} : { anchor }),
    message,
    requestId: request.requestId,
    // A rejected sort never bumps: echo the current (un-bumped) witness.
    revision: request.revision ?? state.revision,
  }
}

export function sortRejectionFromError(
  state: WorkerBackendState,
  request: SortRangeRequest,
  error: unknown,
): SortRangeRejectedResult | null {
  const err = error as Error & { code?: string; detail?: unknown }
  if (err?.code !== 'SORT_REJECTED') return null
  const detail = (err.detail ?? {}) as { code?: unknown; anchor?: unknown; message?: unknown }
  return sortRejectedResult(state, 
    request,
    normalizeSortRejectionCode(detail.code),
    typeof detail.message === 'string' ? detail.message : err.message,
    typeof detail.anchor === 'string' ? detail.anchor : undefined,
  )
}

export async function sortRangeThroughWorker(
  state: WorkerBackendState,
  request: SortRangeRequest,
): Promise<SortRangeResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const range = normalizeRange(request.range)

  const rangeArea = (range.rowEnd - range.rowStart + 1) * (range.colEnd - range.colStart + 1)
  if (rangeArea > MAX_SORT_SOURCE_CELLS) {
    return sortRejectedResult(state, 
      request,
      'source-too-large',
      `sort range spans ${rangeArea} cells but the cap is ${MAX_SORT_SOURCE_CELLS}`,
    )
  }

  const merges = state.mergeRangesBySheetId.get(request.sheetId) ?? []
  if (merges.some((merge) => rangesIntersect(merge, range))) {
    return sortRejectedResult(state, 
      request,
      'merge-in-range',
      'the sort range intersects a merged range; unmerge before sorting',
    )
  }

  const payload: SortRangePayloadWire = {
    range: toSortRangeBounds(range),
    keys: request.keys.map((key) => ({
      col: key.col,
      ...(key.direction === undefined ? {} : { direction: key.direction }),
      ...(key.caseSensitive === undefined ? {} : { caseSensitive: key.caseSensitive }),
    })),
    ...(request.excludedRows === undefined ? {} : { excludedRows: [...request.excludedRows] }),
  }

  let appliedRevision: ProjectionRevision = state.revision
  try {
    const report = await recordCellMutation<SortRangeReportWire>(state, {
      kind: 'range.sort',
      sheet,
      range,
      captureValues: true,
      captureFormats: true,
      // A no-op sort (movedRows 0) writes nothing and pushes no undo
      // record — UI-core pushes no history entry for it either, so
      // recording here would skew the host↔worker stack (design §7).
      shouldRecord: (sortReport) => sortReport.movedRows > 0,
      execute: async () => {
        const result = await state.client.sortRange(sheet.idx, payload)
        appliedRevision = bumpRevision(state)
        return result
      },
    })
    return {
      kind: 'sort-range',
      sheetId: request.sheetId,
      applied: true,
      movedRows: report.movedRows,
      movedCells: report.movedCells,
      affectedRange: { ...range },
      rowPermutation: report.rowPermutation,
      requestId: request.requestId,
      revision: request.revision ?? appliedRevision,
    }
  } catch (error) {
    const rejection = sortRejectionFromError(state, request, error)
    if (rejection !== null) return rejection
    throw error
  }
}
