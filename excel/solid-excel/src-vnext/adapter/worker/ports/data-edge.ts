// 一句话：数据边缘导航端口。

import type { ResolveDataEdgeRequest, ResolveDataEdgeResult } from '@einfach/spreadsheet-ui-core'
import { resolveWorkerDataEdge } from '../data-edge'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createDataEdgePorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'resolveDataEdge'> {
  return {
    async resolveDataEdge(request: ResolveDataEdgeRequest): Promise<ResolveDataEdgeResult> {
      return resolveWorkerDataEdge(state, request)
    },
  }
}
