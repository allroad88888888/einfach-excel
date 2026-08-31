// 一句话：区域格式写入在 worker 上的执行。

import type {
  SetFormatRangeRequest,
  ToolbarBackendMutationResult,
} from '@einfach/spreadsheet-ui-core'
import type { CellFormatJSON } from '../worker-protocol'
import { recordCellMutation } from './record-cell-mutation'
import { bumpRevision } from './revision'
import { resolveSheet } from './sheet-ops'
import { toSparseRange } from './wire-range'
import type { WorkerBackendState } from './state'

export async function setFormatRangeThroughWorker(
  state: WorkerBackendState,
  request: SetFormatRangeRequest,
): Promise<ToolbarBackendMutationResult> {
  const sheet = await resolveSheet(state, request.sheetId)
  return recordCellMutation(state, {
    kind: 'format.set',
    sheet,
    range: { ...request.range },
    captureValues: false,
    captureFormats: true,
    execute: async () => {
      await state.client.setFormatRange(
        toSparseRange(sheet.idx, request.range),
        request.format as CellFormatJSON | null | undefined,
      )
      const nextRevision = bumpRevision(state)

      return {
        kind: request.kind,
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? nextRevision,
        affectedRange: {
          rowStart: request.range.rowStart,
          rowEnd: request.range.rowEnd,
          colStart: request.range.colStart,
          colEnd: request.range.colEnd,
        },
      }
    },
  })
}
