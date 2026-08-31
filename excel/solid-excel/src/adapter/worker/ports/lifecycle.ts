// 一句话：后端实例生命周期端口。

import type { WorkerWorkbookSpreadsheetBackend } from '../types'
import type { WorkerBackendState } from '../state'

export function createLifecyclePorts(
  state: WorkerBackendState,
): Pick<
  WorkerWorkbookSpreadsheetBackend,
  'subscribeContentChanges' | 'ready' | 'sheets' | 'dispose'
> {
  return {
    subscribeContentChanges(handler: () => void): () => void {
      state.contentChangeHandlers.add(handler)
      return () => {
        state.contentChangeHandlers.delete(handler)
      }
    },

    ready() {
      return state.readyPromise
    },

    sheets() {
      return state.lookup.sheets.map((sheet) => ({ ...sheet }))
    },

    dispose() {
      if (state.disposed) {
        return
      }
      state.disposed = true
      state.offDirty()
      state.client.dispose()
    },
  }
}
