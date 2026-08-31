// 一句话：撤销重做端口。

import type { StaticSpreadsheetBackend } from '../backend-contract'
import { applyStateDelta } from '../history-apply'
import { nextRevisionOrThrow } from '../revision'
import type { StaticBackendState } from '../state'

export function createHistoryPorts(
  state: StaticBackendState,
): Pick<StaticSpreadsheetBackend, 'undoTransaction' | 'redoTransaction'> {
  return {
    async undoTransaction(request) {
      const delta = state.undoStack[state.undoStack.length - 1]
      if (!delta) {
        throw new Error('nothing to undo')
      }
      const nextRevision = nextRevisionOrThrow(state.revision)
      state.pendingDelta = null
      const forward = applyStateDelta(state, delta)
      state.undoStack.pop()
      state.redoStack.push(forward)
      state.revision = nextRevision
      return {
        transactionId: request.transactionId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
    async redoTransaction(request) {
      const delta = state.redoStack[state.redoStack.length - 1]
      if (!delta) {
        throw new Error('nothing to redo')
      }
      const nextRevision = nextRevisionOrThrow(state.revision)
      state.pendingDelta = null
      const reverse = applyStateDelta(state, delta)
      state.redoStack.pop()
      state.undoStack.push(reverse)
      state.revision = nextRevision
      return {
        transactionId: request.transactionId,
        requestId: request.requestId,
        revision: state.revision,
      }
    },
  }
}
