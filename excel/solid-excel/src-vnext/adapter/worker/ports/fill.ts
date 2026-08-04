// 一句话：拖拽填充端口。

import type { FillRangeRequest, FillSeriesRequest } from '@einfach/spreadsheet-ui-core'
import { fillRangeThroughWorker, fillSeriesThroughWorker } from '../auto-fill'
import { autoFillIsSupported } from '../capabilities'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createFillPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'fillRange' | 'fillSeries'> {
  const fillRange = (request: FillRangeRequest) => fillRangeThroughWorker(state, request)
  const fillSeries = (request: FillSeriesRequest) => fillSeriesThroughWorker(state, request)

  return {
    get fillRange() {
      return autoFillIsSupported(state) ? fillRange : undefined
    },

    get fillSeries() {
      return autoFillIsSupported(state) ? fillSeries : undefined
    },
  }
}
