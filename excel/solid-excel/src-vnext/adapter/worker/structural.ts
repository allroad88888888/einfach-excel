// 一句话：行列插入删除在 worker 上的执行。

import type {
  BackendMutationResult,
  DeleteColumnsRequest,
  DeleteRowsRequest,
  InsertColumnsRequest,
  InsertRowsRequest,
} from '@einfach/spreadsheet-ui-core'
import { shiftFilterHiddenOverlay, shiftMergeOverlay } from './overlay-shift'
import { recordStructuralMutation } from './record-structural-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { structuralMutationResult } from './structural-ack'
import type { WorkerBackendState } from './state'

export async function insertRowsThroughWorker(
  state: WorkerBackendState,
  request: InsertRowsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  return recordStructuralMutation(state, {
    kind: 'row.insert',
    sheet,
    sheetId: request.sheetId,
    execute: async () => {
      await state.client.insertRows(sheet.idx, request.rowIndex, request.count)
      shiftMergeOverlay(state, request.sheetId, 'row', request.rowIndex, request.count, 1)
      // The engine self-displaces its OWNED filter set on `insertRows`; this
      // only keeps the projection mirror in step (no re-push). The undo
      // before/after images are captured from the mirror in
      // `recordStructuralMutation` around this `execute`.
      shiftFilterHiddenOverlay(state, request.sheetId, request.rowIndex, request.count, 1)
      return structuralMutationResult(request, bumpRevision(state))
    },
  })
}

export async function deleteRowsThroughWorker(
  state: WorkerBackendState,
  request: DeleteRowsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  return recordStructuralMutation(state, {
    kind: 'row.delete',
    sheet,
    sheetId: request.sheetId,
    execute: async () => {
      await state.client.deleteRows(sheet.idx, request.rowIndex, request.count)
      shiftMergeOverlay(state, request.sheetId, 'row', request.rowIndex, request.count, -1)
      // Engine self-displaces its OWNED set on `deleteRows`; mirror follows.
      shiftFilterHiddenOverlay(state, request.sheetId, request.rowIndex, request.count, -1)
      return structuralMutationResult(request, bumpRevision(state))
    },
  })
}

export async function insertColumnsThroughWorker(
  state: WorkerBackendState,
  request: InsertColumnsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  return recordStructuralMutation(state, {
    kind: 'column.insert',
    sheet,
    sheetId: request.sheetId,
    execute: async () => {
      await state.client.insertColumns(sheet.idx, request.colIndex, request.count)
      shiftMergeOverlay(state, request.sheetId, 'column', request.colIndex, request.count, 1)
      return structuralMutationResult(request, bumpRevision(state))
    },
  })
}

export async function deleteColumnsThroughWorker(
  state: WorkerBackendState,
  request: DeleteColumnsRequest,
): Promise<BackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  return recordStructuralMutation(state, {
    kind: 'column.delete',
    sheet,
    sheetId: request.sheetId,
    execute: async () => {
      await state.client.deleteColumns(sheet.idx, request.colIndex, request.count)
      shiftMergeOverlay(state, request.sheetId, 'column', request.colIndex, request.count, -1)
      return structuralMutationResult(request, bumpRevision(state))
    },
  })
}
