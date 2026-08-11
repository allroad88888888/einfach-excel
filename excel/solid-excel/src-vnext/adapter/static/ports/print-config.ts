// 一句话：静态运行时向 UI 暴露引擎拥有的打印配置。

import type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  SetPrintConfigResult,
} from '@einfach/spreadsheet-ui-core'
import type { StaticSpreadsheetBackend } from '../backend-contract'
import type { StaticBackendState } from '../state'

export function createPrintConfigPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'readPrintConfig' | 'setPrintConfig'> {
  return {
    async readPrintConfig(request: ReadPrintConfigRequest): Promise<ReadPrintConfigResult> {
      const snapshot = state.printConfigs.read(request.sheetId)
      return {
        kind: 'print-config',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: snapshot.revision,
        config: snapshot.config,
      }
    },

    async setPrintConfig(request: SetPrintConfigRequest): Promise<SetPrintConfigResult> {
      const snapshot = state.printConfigs.write(request.sheetId, request.config)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: snapshot.revision,
      }
    },
  }
}
