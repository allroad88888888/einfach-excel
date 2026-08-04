// 一句话：格式与行高列宽端口。

import type {
  BackendMutationResult,
  SetColumnWidthRequest,
  SetFormatRangeRequest,
  SetRowHeightRequest,
} from '@einfach/spreadsheet-ui-core'
import { normalizeDimensionSize } from '@einfach/spreadsheet-ui-core'
import { runtimeSupports } from '../capabilities'
import { setFormatRangeThroughWorker } from '../format'
import { bumpRevision } from '../revision'
import { resolveSheet } from '../sheet-ops'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createFormatPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'setFormatRange' | 'setRowHeight' | 'setColumnWidth'> {
  const setFormatRange = (request: SetFormatRangeRequest) =>
    setFormatRangeThroughWorker(state, request)

  return {
    get setFormatRange() {
      return runtimeSupports(state, 'formats') ? setFormatRange : undefined
    },

    async setRowHeight(request: SetRowHeightRequest): Promise<BackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      await state.client.setRowHeight(
        sheet.idx,
        request.rowIndex,
        normalizeDimensionSize(request.heightPx),
      )
      const nextRevision = bumpRevision(state)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? nextRevision,
      }
    },

    async setColumnWidth(request: SetColumnWidthRequest): Promise<BackendMutationResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      await state.client.setColumnWidth(
        sheet.idx,
        request.colIndex,
        normalizeDimensionSize(request.widthPx),
      )
      const nextRevision = bumpRevision(state)

      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? nextRevision,
      }
    },
  }
}
