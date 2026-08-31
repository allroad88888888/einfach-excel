// 一句话：Ctrl+方向键的数据边缘解析。

import type { ResolveDataEdgeRequest, ResolveDataEdgeResult } from '@einfach/spreadsheet-ui-core'
import type { SparseCellWire } from '../worker-protocol'
import {
  clampIndex,
  normalizeCount,
  resolveLineDataEdge,
  uniqueSortedIndexes,
} from './data-edge-line'
import { resolveSheet } from './sheet-ops'
import type { WorkerBackendState } from './state'

export async function resolveWorkerDataEdge(
  state: WorkerBackendState,
  request: ResolveDataEdgeRequest,
): Promise<ResolveDataEdgeResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  const rowCount = normalizeCount(request.bounds.rowCount)
  const colCount = normalizeCount(request.bounds.colCount)
  const from = {
    row: clampIndex(request.from.row, rowCount),
    col: clampIndex(request.from.col, colCount),
  }

  if (request.direction === 'left' || request.direction === 'right') {
    const cells = await state.client.snapshotRangeSparse({
      sheet: sheet.idx,
      startRow: from.row,
      endRow: from.row,
      startCol: 0,
      endCol: colCount - 1,
    })
    const occupiedCols = uniqueSortedIndexes(
      cells.map((cell: SparseCellWire) => clampIndex(cell.col, colCount)),
    )
    return {
      sheetId: request.sheetId,
      requestId: request.requestId,
      revision: request.revision ?? state.revision,
      target: {
        row: from.row,
        col: resolveLineDataEdge(
          from.col,
          occupiedCols,
          colCount - 1,
          request.direction === 'right' ? 1 : -1,
        ),
      },
    }
  }

  const cells = await state.client.snapshotRangeSparse({
    sheet: sheet.idx,
    startRow: 0,
    endRow: rowCount - 1,
    startCol: from.col,
    endCol: from.col,
  })
  const occupiedRows = uniqueSortedIndexes(
    cells.map((cell: SparseCellWire) => clampIndex(cell.row, rowCount)),
  )
  return {
    sheetId: request.sheetId,
    requestId: request.requestId,
    revision: request.revision ?? state.revision,
    target: {
      row: resolveLineDataEdge(
        from.row,
        occupiedRows,
        rowCount - 1,
        request.direction === 'down' ? 1 : -1,
      ),
      col: from.col,
    },
  }
}
