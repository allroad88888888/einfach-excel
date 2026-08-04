// 一句话：撤销重做端口。

import type {
  HistoryTransactionResult,
  RedoTransactionRequest,
  UndoTransactionRequest,
} from '@einfach/spreadsheet-ui-core'
import { runHistoryTransaction } from '../history-replay'
import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createHistoryPorts(
  state: WorkerBackendState,
): Pick<WorkerWorkbookSpreadsheetBackend, 'undoTransaction' | 'redoTransaction'> {
  return {
    async undoTransaction(request: UndoTransactionRequest): Promise<HistoryTransactionResult> {
      return runHistoryTransaction(state, 'undo', request)
    },

    async redoTransaction(request: RedoTransactionRequest): Promise<HistoryTransactionResult> {
      return runHistoryTransaction(state, 'redo', request)
    },
  }
}
