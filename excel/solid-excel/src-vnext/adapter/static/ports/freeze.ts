// 一句话：冻结窗格端口。

import type { StaticSpreadsheetBackend } from '../backend-contract'
import { beginUndoableMutation, recordFreezeBefore } from '../history-record'
import { bumpRevision } from '../revision'
import type { StaticBackendState } from '../state'

export function createFreezePorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'readFreezeConfig' | 'setFreezeConfig'> {
  return {
    async readFreezeConfig(request) {
      if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
        throw new Error(`unknown sheet: ${request.sheetId}`)
      }
      const freeze = state.freezeBySheetId.get(request.sheetId) ?? { rows: 0, cols: 0 }
      return {
        kind: 'freeze-config',
        sheetId: request.sheetId,
        freeze: { ...freeze },
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    async setFreezeConfig(request) {
      if (!state.sheets.some((sheet) => sheet.id === request.sheetId)) {
        throw new Error(`unknown sheet: ${request.sheetId}`)
      }
      if (
        !Number.isSafeInteger(request.freeze.rows) ||
        request.freeze.rows < 0 ||
        !Number.isSafeInteger(request.freeze.cols) ||
        request.freeze.cols < 0
      ) {
        throw new Error('freeze rows and columns must be non-negative safe integers')
      }
      if (request.revision !== undefined && request.revision !== state.revision) {
        throw new Error(
          `freeze revision conflict: expected ${String(request.revision)}, current ${String(state.revision)}`,
        )
      }
      beginUndoableMutation(state)
      recordFreezeBefore(state, request.sheetId)
      state.freezeBySheetId.set(request.sheetId, {
        rows: request.freeze.rows,
        cols: request.freeze.cols,
      })
      state.revision = bumpRevision(state.revision)
      return {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
  }
}
