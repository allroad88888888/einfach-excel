// 一句话：把 Worker 引擎的打印配置快照映射成精确关联的 UI 端口响应。

import type {
  ReadPrintConfigRequest,
  ReadPrintConfigResult,
  SetPrintConfigRequest,
  SetPrintConfigResult,
} from '@einfach/spreadsheet-ui-core'
import { snapshotPrintConfig } from '@einfach/spreadsheet-ui-core'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import { resolveSheet } from '../sheet-ops'
import type { WorkerBackendState } from '../state'

function requirePrintMethods(state: WorkerBackendState): {
  get: NonNullable<typeof state.client.getPrintConfig>
  set: NonNullable<typeof state.client.setPrintConfig>
} {
  const get = state.client.getPrintConfig
  const set = state.client.setPrintConfig
  if (typeof get !== 'function' || typeof set !== 'function') {
    throw new Error('worker runtime does not implement print configuration')
  }
  return { get, set }
}

export function createPrintConfigPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'readPrintConfig' | 'setPrintConfig'> {
  return {
    async readPrintConfig(request: ReadPrintConfigRequest): Promise<ReadPrintConfigResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const snapshot = await requirePrintMethods(state).get(sheet.idx)
      const config = snapshotPrintConfig(snapshot.config)
      if (
        snapshot.sheet !== sheet.idx ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0 ||
        config === null
      ) {
        throw new Error('worker returned an invalid print configuration snapshot')
      }
      return {
        kind: 'print-config',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: snapshot.revision,
        config,
      }
    },

    async setPrintConfig(request: SetPrintConfigRequest): Promise<SetPrintConfigResult> {
      const sheet = await resolveSheet(state, request.sheetId)
      const config = snapshotPrintConfig(request.config)
      if (config === null) throw new Error('invalid print configuration')
      const snapshot = await requirePrintMethods(state).set(sheet.idx, config)
      if (
        snapshot.sheet !== sheet.idx ||
        !Number.isSafeInteger(snapshot.revision) ||
        snapshot.revision < 0
      ) {
        throw new Error('worker returned an invalid print configuration acknowledgement')
      }
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: snapshot.revision,
      }
    },
  }
}
