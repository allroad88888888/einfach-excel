/// <reference lib="WebWorker" />

import { restoreWorkbookPrintConfigs } from '@einfach/excel-core-ts'
import type { CellRefWire, RpcErrorWire, RpcResponseWire } from './worker-protocol'
import {
  preserveTsWorkerConditionalFormats,
  restoreTsWorkerConditionalFormats,
} from './worker-runtime-ts-conditional-format'
import {
  preserveTsWorkerPrintConfigs,
  restoreTsWorkerPrintConfigs,
  validateTsWorkerPrintConfigRestore,
} from './worker-runtime-ts-print-config'
import { normalizeAddr } from './worker-wire-guards'
import { handleCellCommands } from './worker-runtime-ts/command-cells'
import { handleFormulaCommands } from './worker-runtime-ts/command-formulas'
import { handleTransferCommands } from './worker-runtime-ts/command-transfer'
import { handleUnsupportedCommands } from './worker-runtime-ts/command-unsupported'
import { handleViewCommands } from './worker-runtime-ts/command-view'
import { handleWorkbookCommands } from './worker-runtime-ts/command-workbook'
import { createCustomFormulaPump, rebindCustomFormulas } from './worker-runtime-ts/custom-formulas'
import type { PersistenceServices } from './worker-runtime-ts/persistence'
import { createRuntimeDispatch } from './worker-runtime-ts/runtime-dispatch'
import { rpcError, toRpcError, type RequestMessage } from './worker-runtime-ts/runtime-errors'
import { TS_WORKER_RUNTIME_CAPABILITIES } from './worker-runtime-ts/runtime-capabilities'
import {
  assertSheetIdx,
  createInitialState,
  listSheetMeta,
  makeWorkbookFor,
  type RuntimeState,
} from './worker-runtime-ts/runtime-state'
import { createSheetLifecycle } from './worker-runtime-ts/sheet-lifecycle'
import {
  removeViewportSizesSheet,
  renameViewportSizesSheet,
  resetViewportSizes,
  restorePersistenceSizes,
  snapshotPersistenceSizes,
} from './worker-runtime-ts/viewport-sizes'

export interface WorkerContext {
  postMessage(msg: unknown): void
  addEventListener(type: 'message', listener: (e: MessageEvent) => void): void
}

export interface ExcelCoreTsWorkerRuntime {
  handle(
    msg: RequestMessage,
  ): Promise<
    { id: number; ok: true; result: unknown } | { id: number; ok: false; error: RpcErrorWire }
  >
  reset(): void
  state(): RuntimeState
  asyncPumpIdle(): Promise<void>
}

type WorkerRuntimeTsEvents = {
  postDirty?(cells: CellRefWire[]): void
}

const dispatch = createRuntimeDispatch([
  handleWorkbookCommands,
  handleCellCommands,
  handleViewCommands,
  handleTransferCommands,
  handleFormulaCommands,
  handleUnsupportedCommands,
])

const lifecycle = createSheetLifecycle({
  makeWorkbook: makeWorkbookFor,
  assertSheet: assertSheetIdx,
  listSheets: listSheetMeta,
  preservePrintConfigs: preserveTsWorkerPrintConfigs,
  restorePrintConfigs: restoreWorkbookPrintConfigs,
  preserveConditionalFormats: preserveTsWorkerConditionalFormats,
  rebindCustomFormulas,
  resetViewportSizes,
  renameViewportSizesSheet,
  removeViewportSizesSheet,
  validatePrintConfigRestore: validateTsWorkerPrintConfigRestore,
  restorePersistencePrintConfigs: restoreTsWorkerPrintConfigs,
  restoreConditionalFormats: restoreTsWorkerConditionalFormats,
})

const persistence: PersistenceServices = {
  snapshotSizes: snapshotPersistenceSizes,
  restoreSizes: restorePersistenceSizes,
  rebuildForRestore: lifecycle.rebuildForRestore,
}

export function createWorkerRuntimeTs(events?: WorkerRuntimeTsEvents): ExcelCoreTsWorkerRuntime {
  let state = createInitialState()
  const asyncCustomPump = createCustomFormulaPump(() => state, events?.postDirty)

  return {
    async handle(msg) {
      if (typeof msg.id !== 'number') throw rpcError('INVALID_RPC', 'rpc message missing id')
      const id = msg.id
      try {
        const result = await dispatch(msg, { state, lifecycle, persistence })
        return { id, ok: true as const, result }
      } catch (error) {
        return { id, ok: false as const, error: toRpcError(error) }
      } finally {
        asyncCustomPump.pump()
      }
    },
    reset() {
      state = createInitialState()
    },
    state: () => state,
    asyncPumpIdle: () => asyncCustomPump.idle(),
  }
}

export function installWorkerRuntimeTs(target?: WorkerContext): ExcelCoreTsWorkerRuntime {
  const context: WorkerContext = target ?? (self as unknown as WorkerContext)
  const runtime = createWorkerRuntimeTs({
    postDirty: (cells) => context.postMessage({ event: 'cellsDirty', cells }),
  })
  context.addEventListener('message', async (event: MessageEvent) => {
    const msg = event.data as RequestMessage
    if (typeof msg.id !== 'number') return
    const response = await runtime.handle(msg)
    const wire: RpcResponseWire = response.ok
      ? { id: response.id, ok: true, result: response.result }
      : { id: response.id, ok: false, error: response.error }
    context.postMessage(wire)
    if (response.ok && isMutatingCommand(msg.cmd)) {
      const sheet = Number((msg as { sheet?: unknown }).sheet ?? 0)
      const addr =
        typeof (msg as { addr?: unknown }).addr === 'string'
          ? normalizeAddr((msg as { addr: string }).addr)
          : 'A1'
      context.postMessage({ event: 'cellsDirty', cells: [{ sheet, addr }] })
    }
  })
  return runtime
}

function isMutatingCommand(cmd: unknown): boolean {
  return MUTATING_COMMANDS.has(String(cmd))
}

const MUTATING_COMMANDS = new Set([
  'setCell',
  'setFormula',
  'setFormulaDetailed',
  'clearCell',
  'clearRange',
  'commitImport',
  'restoreSparse',
  'restorePersistenceV1',
  'setPrintConfig',
  'setConditionalFormatRule',
  'removeConditionalFormatRule',
  'insertRows',
  'deleteRows',
  'insertColumns',
  'deleteColumns',
  'addSheet',
  'removeSheet',
  'renameSheet',
  'moveSheet',
  'defineName',
  'undefineName',
])

export { createInitialState as __createInitialStateForTest }
export { TS_WORKER_RUNTIME_CAPABILITIES }
