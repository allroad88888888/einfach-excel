// 一句话：按行号列表删除行的分带执行与精确 ACK。

import type {
  RemoveRowsExactRequest,
  RemoveRowsExactResult,
  RemoveRowsRequest,
  RemoveRowsResult,
} from '@einfach/spreadsheet-ui-core'
import { createBackendError } from './backend-error'
import { shiftFilterHiddenOverlay, shiftMergeOverlay } from './overlay-shift'
import { recordStructuralMutation } from './record-structural-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import type { WorkerWorkbookBackendSheet } from './types'
import type { WorkerBackendState } from './state'

export async function removeRowsThroughWorker(
  state: WorkerBackendState,
  request: RemoveRowsRequest,
): Promise<RemoveRowsResult> {
  if (request.rows.length === 0) {
    return {
      sheetId: request.sheetId,
      removedRows: 0,
      revision: request.revision ?? state.revision,
    }
  }

  const unique = Array.from(new Set(request.rows)).filter(
    (row) => Number.isInteger(row) && row >= 0,
  )
  if (unique.length === 0) {
    return {
      sheetId: request.sheetId,
      removedRows: 0,
      revision: request.revision ?? state.revision,
    }
  }

  const sheet = await resolveSheet(state, request.sheetId)
  unique.sort((left, right) => right - left)

  // Partial failure throws out of `execute`, so no transaction record
  // is pushed — mirroring the remove-duplicates dispatcher, which does
  // not push a history entry on the failure path either. The lifecycle
  // there lands on outcome-unknown and the user reconciles.
  return recordStructuralMutation(state, {
    kind: 'row.delete',
    sheet,
    sheetId: request.sheetId,
    execute: () => removeRowsBands(state, request, sheet, unique),
  })
}

export async function removeRowsBands(
  state: WorkerBackendState,
  request: RemoveRowsRequest,
  sheet: WorkerWorkbookBackendSheet,
  unique: number[],
): Promise<RemoveRowsResult> {
  const bands: Array<{ startRow: number; count: number }> = []
  for (const rowIndex of unique) {
    const last = bands[bands.length - 1]
    if (last && last.startRow === rowIndex + 1) {
      last.startRow = rowIndex
      last.count += 1
    } else {
      bands.push({ startRow: rowIndex, count: 1 })
    }
  }

  const successfullyRemoved: number[] = []
  let failureCause: unknown = null
  for (const band of bands) {
    try {
      const accepted = await state.client.deleteRows(sheet.idx, band.startRow, band.count)
      if (accepted !== true) {
        failureCause = createBackendError(
          'DELETE_ROWS_NOT_ACCEPTED',
          `worker did not accept deleteRows(${band.startRow}, ${band.count})`,
        )
        break
      }
      for (let offset = band.count - 1; offset >= 0; offset -= 1) {
        successfullyRemoved.push(band.startRow + offset)
      }
      // Bands run bottom-up, so shifting the #04 merge overlay per
      // accepted band composes exactly like the static backend's
      // per-row descending remap: lower bands keep their original
      // coordinates until their own turn. On partial failure the
      // overlay matches the bands the engine really deleted.
      shiftMergeOverlay(state, request.sheetId, 'row', band.startRow, band.count, -1)
      // The engine self-displaces its OWNED filter set on each `deleteRows`
      // (`Sheet::shift_filter_hidden_rows`), so SUBTOTAL already reads the
      // displaced band and there is no re-push; this only keeps the projection
      // mirror in step. Undo images are captured from the mirror around the
      // whole `execute` in `recordStructuralMutation`.
      shiftFilterHiddenOverlay(state, request.sheetId, band.startRow, band.count, -1)
    } catch (error) {
      failureCause = error
      break
    }
  }

  if (failureCause !== null) {
    const nextRevision = bumpRevision(state)
    const partialMinRow =
      successfullyRemoved.length > 0 ? successfullyRemoved[successfullyRemoved.length - 1] : 0
    const partialMaxRow = successfullyRemoved.length > 0 ? successfullyRemoved[0] : 0
    const error = new Error(
      'removeRows partially failed: deleted ' +
        String(successfullyRemoved.length) +
        ' of ' +
        String(unique.length) +
        ' rows before the worker rejected — ' +
        (failureCause instanceof Error ? failureCause.message : String(failureCause)),
    ) as Error & {
      cause?: unknown
      removedRows: number
      partial: true
      affectedRange?: RemoveRowsResult['affectedRange']
      revision: number | string
    }
    error.cause = failureCause
    error.removedRows = successfullyRemoved.length
    error.partial = true
    error.revision = request.revision ?? nextRevision
    if (successfullyRemoved.length > 0) {
      error.affectedRange = {
        startRow: partialMinRow,
        endRow: partialMaxRow,
        startCol: 0,
        endCol: Number.MAX_SAFE_INTEGER,
      }
    }
    throw error
  }

  const minRow = unique[unique.length - 1]
  const maxRow = unique[0]
  const nextRevision = bumpRevision(state)
  return {
    sheetId: request.sheetId,
    removedRows: unique.length,
    affectedRange: {
      startRow: minRow,
      endRow: maxRow,
      startCol: 0,
      endCol: Number.MAX_SAFE_INTEGER,
    },
    revision: request.revision ?? nextRevision,
  }
}

export function assertExactRemoveRowsRequest(
  state: WorkerBackendState,
  request: RemoveRowsExactRequest,
): void {
  const range = request.targetRange
  const validRange =
    Number.isSafeInteger(range.rowStart) &&
    Number.isSafeInteger(range.rowEnd) &&
    Number.isSafeInteger(range.colStart) &&
    Number.isSafeInteger(range.colEnd) &&
    range.rowStart >= 0 &&
    range.colStart >= 0 &&
    range.rowStart <= range.rowEnd &&
    range.colStart <= range.colEnd
  const validRows =
    request.rows.length > 0 &&
    request.rows.every(
      (row, index) =>
        Number.isSafeInteger(row) &&
        row >= range.rowStart &&
        row <= range.rowEnd &&
        (index === 0 || request.rows[index - 1] < row),
    )
  const validRevision =
    typeof request.revision === 'number' &&
    Number.isFinite(request.revision) &&
    request.revision === state.revision

  if (!validRange || !validRows || !validRevision) {
    throw createBackendError(
      'INVALID_REMOVE_ROWS_EXACT_REQUEST',
      'removeRowsExact requires a canonical in-range row list and the current numeric revision',
    )
  }
}

export async function removeRowsExactThroughWorker(
  state: WorkerBackendState,
  request: RemoveRowsExactRequest,
): Promise<RemoveRowsExactResult> {
  assertExactRemoveRowsRequest(state, request)
  const mutation = await removeRowsThroughWorker(state, {
    kind: 'remove-rows',
    sheetId: request.sheetId,
    rows: [...request.rows],
  })
  if (
    typeof mutation.revision !== 'number' ||
    !Number.isFinite(mutation.revision) ||
    mutation.revision === request.revision
  ) {
    throw createBackendError(
      'INVALID_REMOVE_ROWS_EXACT_ACK',
      'worker row deletion completed without a distinct numeric revision',
    )
  }

  return {
    requestId: request.requestId,
    sheetId: request.sheetId,
    targetRange: { ...request.targetRange },
    removedRowIndices: [...request.rows],
    removedRows: request.rows.length,
    affectedRange: {
      startRow: request.rows[0],
      endRow: request.targetRange.rowEnd,
      startCol: request.targetRange.colStart,
      endCol: request.targetRange.colEnd,
    },
    revision: mutation.revision,
  }
}
