// 一句话：数据边缘导航端口。

import type { StaticSpreadsheetBackend } from '../backend-contract'
import { resolveStaticDataEdge } from '../data-edge'
import type { StaticBackendState } from '../state'

export function createDataEdgePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'resolveDataEdge'> {
  return {
    async resolveDataEdge(request) {
      return resolveStaticDataEdge(state, request)
    },
  }
}
