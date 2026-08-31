import {
  createWorkerCustomFormulaRuntime,
  type WorkerCustomFormulaRuntime,
} from './worker-custom-formulas'
import {
  createWorkerSessionHandleRegistry,
  type WorkerSessionHandleRegistry,
} from './worker-session-registry'
import type { WasmWorkbookRuntime } from './wasm-workbook-surface'

/**
 * The worker-only resources tied to one live workbook runtime.
 *
 * These are intentionally not atoms: they are WASM subscriptions, stream
 * cursors and compiled callbacks. UI intent, errors and loading state stay in
 * the host's atom graph. Resetting a workbook drops only resources that name
 * its previous engine; the worker process terminating releases the whole owner.
 */
export type WorkerWorkbookRuntimeResources = {
  readonly sessionHandles: WorkerSessionHandleRegistry
  readonly customFormulas: WorkerCustomFormulaRuntime
  resetForNewWorkbook(previousWorkbook?: WasmWorkbookRuntime): void
  dispose(previousWorkbook?: WasmWorkbookRuntime): void
}

export function createWorkerWorkbookRuntimeResources(
  currentWorkbook: () => WasmWorkbookRuntime | undefined,
): WorkerWorkbookRuntimeResources {
  const sessionHandles = createWorkerSessionHandleRegistry()
  const customFormulas = createWorkerCustomFormulaRuntime(currentWorkbook)

  function resetForNewWorkbook(previousWorkbook?: WasmWorkbookRuntime) {
    sessionHandles.resetSessionHandles(previousWorkbook)
    customFormulas.clear()
  }

  return {
    sessionHandles,
    customFormulas,
    resetForNewWorkbook,
    dispose: resetForNewWorkbook,
  }
}
