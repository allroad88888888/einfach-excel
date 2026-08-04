// 一句话：视口行高列宽的投影读取。

import type {
  ViewportSizeProjectionRequest,
  ViewportSizeProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { resolveSheet } from './sheet-ops'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

export async function readViewportSizeProjection(
  state: WorkerBackendState,
  request: ViewportSizeProjectionRequest,
): Promise<ViewportSizeProjectionResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const snapshot = await state.client.snapshotViewportSizes(
    toSparseRange(sheet.idx, request.window),
  )
  const rowHeights = [...(snapshot.rowHeights ?? [])].sort(
    (left, right) => left.rowIndex - right.rowIndex,
  )
  const colWidths = [...(snapshot.colWidths ?? [])].sort(
    (left, right) => left.colIndex - right.colIndex,
  )

  return {
    kind: 'viewport-size',
    sheetId: request.sheetId,
    window: { ...request.window },
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    rowHeights,
    colWidths,
  }
}
