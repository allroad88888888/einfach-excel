// 一句话：投影读取端口。

import type {
  RangeProjectionRequest,
  RangeProjectionResult,
  ViewportSizeProjectionRequest,
  ViewportSizeProjectionResult,
  VisibleProjectionRequest,
  VisibleProjectionResult,
} from '@einfach/spreadsheet-ui-core'
import { readRange } from '../read-range'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import { readViewportSizeProjection } from '../viewport-size'
import type { WorkerBackendState } from '../state'

export function createProjectionPorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'readVisibleProjection' | 'readRangeProjection' | 'readViewportSizeProjection'
> {
  return {
    async readVisibleProjection(
      request: VisibleProjectionRequest,
    ): Promise<VisibleProjectionResult> {
      const result = await readRange(state, request.sheetId, request.window, request.revision)

      return {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: result.revision,
        window: { ...request.window },
        cells: result.cells,
      }
    },

    async readRangeProjection(request: RangeProjectionRequest): Promise<RangeProjectionResult> {
      const result = await readRange(state, request.sheetId, request.range, request.revision)

      return {
        kind: 'range',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: result.revision,
        range: { ...request.range },
        cells: result.cells,
      }
    },

    async readViewportSizeProjection(
      request: ViewportSizeProjectionRequest,
    ): Promise<ViewportSizeProjectionResult> {
      return readViewportSizeProjection(state, request)
    },
  }
}
