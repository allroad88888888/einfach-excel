/// <reference lib="WebWorker" />

import { installHostWorkerGateway } from '../host/worker'
import { executeHostOperation } from '../host/operation-worker'
import { refreshHostWorkbook, controlHostCalculation } from '../host/execution-worker'
import { initializeWorkbook } from './initialize-workbook'
import { openWorkbookFile } from './file-io'
import type { RustWasmModule } from './wasm-types'
import {
  createRuntimeContext,
  type CommandName,
  type CommandPayload,
  type WorkbookHandler,
  type WorkbookHandlers,
} from './dispatch/context'
import { metadataHandlers } from './dispatch/metadata'
import { queryHandlers } from './dispatch/queries'
import { dataToolHandlers } from './dispatch/data-tools'
import { structureHandlers } from './dispatch/structure'
import { sheetHandlers } from './dispatch/sheets'
import { clipboardHandlers } from './dispatch/clipboard'
import { cellWriteHandlers } from './dispatch/cell-writes'
import { drawingHandlers } from './dispatch/drawings'

/** 按命名空间分文件登记；新命令加到对应表，不再改本文件。 */
const workbookHandlers: WorkbookHandlers = {
  ...metadataHandlers,
  ...queryHandlers,
  ...dataToolHandlers,
  ...structureHandlers,
  ...sheetHandlers,
  ...clipboardHandlers,
  ...cellWriteHandlers,
  ...drawingHandlers,
}

/** 在 Worker 内维护唯一 Rust 工作簿，并处理 UI Core 的直接命令。 */
export function installRustWorkbookRuntime(wasm: RustWasmModule): void {
  const context = createRuntimeContext(wasm)

  async function dispatch(command: CommandName, payload: unknown): Promise<unknown> {
    if (command === 'host.refresh') return refreshHostWorkbook(context)
    if (command === 'host.calculation')
      return controlHostCalculation(context, payload as CommandPayload<'host.calculation'>)
    if (command === 'host.execute')
      return executeHostOperation(context, payload as CommandPayload<'host.execute'>, dispatch)
    if (command === 'formula.catalog') {
      await context.ensureWasm()
      if (!wasm.function_catalog) throw new Error('Rust function catalog is unavailable.')
      return wasm.function_catalog()
    }
    if (command === 'workbook.openFile') {
      const input = payload as CommandPayload<typeof command>
      await context.ensureWasm()
      const restored = openWorkbookFile(wasm, input.text, input.idPrefix)
      context.adopt(restored.workbook, restored.metadata.sheets)
      return restored.metadata
    }
    if (command === 'workbook.initialize') {
      const input = payload as CommandPayload<typeof command>
      await context.ensureWasm()
      const initialized = initializeWorkbook(wasm, input.sheets, input.customFormulas)
      context.adopt(initialized.workbook, initialized.sheets)
      return initialized.sheets
    }
    const current = context.currentWorkbook()
    const handler = workbookHandlers[command] as WorkbookHandler<typeof command> | undefined
    if (handler) return handler(context, current, payload as never)
    throw Object.assign(new Error(`Unknown command: ${String(command)}`), {
      code: 'UNKNOWN_COMMAND',
    })
  }

  installHostWorkerGateway({ scope: context.scope, workbook: () => context.workbook,
    sheets: () => context.sheetsById,
    revision: () => context.revision, advanceRevision: () => ++context.revision,
    drain: () => { context.asyncFormulas?.drain() },
  }, dispatch)
}
