/// <reference lib="WebWorker" />

import type {
  BackendMutationResult,
  VisibleProjectionResult,
} from '../backend'
import type { WorkerErrorWire, WorkerRequestWire } from '../rust-worker/types'
import { displayCell, writeCellInput } from './cell-io'
import type {
  RustImportCell,
  RustWorkbookCommands,
  RustWorkbookSheet,
  RustWorkbookSheetInput,
} from './commands'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'

type CommandName = keyof RustWorkbookCommands

function rpcError(error: unknown): WorkerErrorWire {
  if (!(error instanceof Error)) return { code: 'WORKER_ERROR', message: String(error) }
  const typed = error as Error & { code?: string; detail?: unknown }
  return {
    code: typed.code ?? 'WORKER_ERROR',
    message: typed.message,
    ...(typed.detail === undefined ? {} : { detail: typed.detail }),
  }
}

function requiredMethod<T>(method: T | undefined, name: string): T {
  if (method) return method
  throw Object.assign(new Error(`WasmWorkbook.${name} is unavailable`), {
    code: 'WASM_METHOD_UNAVAILABLE',
  })
}

/** 在 Worker 内维护唯一 Rust 工作簿，并处理四条 UI Core 命令。 */
export function installRustWorkbookRuntime(wasm: RustWasmModule): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope
  const sheetsById = new Map<string, RustWorkbookSheet>()
  let workbook: WasmWorkbook | undefined
  let initPromise: Promise<unknown> | undefined
  let revision = 0

  async function ensureWasm(): Promise<void> {
    initPromise ??= wasm.default()
    await initPromise
  }

  async function initialize(
    sheets: readonly RustWorkbookSheetInput[],
  ): Promise<RustWorkbookSheet[]> {
    await ensureWasm()
    const inputs = sheets.length > 0 ? sheets : [{ name: 'Sheet1' }]
    const next = new wasm.WasmWorkbook() as WasmWorkbook
    next.rename_sheet(0, inputs[0]?.name ?? 'Sheet1')
    for (const input of inputs.slice(1)) next.add_sheet(input.name)
    workbook = next
    revision = 0
    sheetsById.clear()
    return inputs.map((input, index) => {
      const sheet = Object.freeze({
        id: input.id ?? `sheet-${index + 1}`,
        index,
        name: next.sheet_name(index),
      })
      sheetsById.set(sheet.id, sheet)
      return sheet
    })
  }

  function currentWorkbook(): WasmWorkbook {
    if (!workbook) throw Object.assign(new Error('Workbook is not initialized'), { code: 'NOT_READY' })
    return workbook
  }

  function sheetIndex(sheetId: string): number {
    const sheet = sheetsById.get(sheetId)
    if (!sheet) throw Object.assign(new Error(`Unknown sheet: ${sheetId}`), { code: 'INVALID_SHEET' })
    return sheet.index
  }

  async function dispatch(command: CommandName, payload: unknown): Promise<unknown> {
    if (command === 'workbook.initialize') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return initialize(input.sheets)
    }
    const current = currentWorkbook()
    if (command === 'workbook.importCells') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return current.bulk_import_cells(input.cells as readonly RustImportCell[])
    }
    if (command === 'projection.readVisible') {
      const { request } = payload as RustWorkbookCommands[typeof command]['payload']
      const read = requiredMethod(current.read_sparse_range, 'read_sparse_range')
      const cells = read.call(
        current,
        sheetIndex(request.sheetId),
        request.window.rowStart,
        request.window.colStart,
        request.window.rowEnd,
        request.window.colEnd,
      )
      const result: VisibleProjectionResult = {
        kind: 'visible-window',
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision: request.revision ?? revision,
        window: { ...request.window },
        cells: cells
          .map(displayCell)
          .filter((cell): cell is NonNullable<typeof cell> => cell !== null)
          .sort((left, right) => left.row - right.row || left.col - right.col),
      }
      return result
    }
    if (command === 'cell.setInput') {
      const { request } = payload as RustWorkbookCommands[typeof command]['payload']
      writeCellInput(
        current,
        sheetIndex(request.sheetId),
        request.row,
        request.col,
        request.input,
      )
      revision += 1
      const result: BackendMutationResult = {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision,
        affectedRange: {
          rowStart: request.row,
          rowEnd: request.row,
          colStart: request.col,
          colEnd: request.col,
        },
      }
      return result
    }
    throw Object.assign(new Error(`Unknown command: ${String(command)}`), {
      code: 'UNKNOWN_COMMAND',
    })
  }

  scope.addEventListener('message', async (event: MessageEvent) => {
    const message = event.data as WorkerRequestWire
    if (typeof message?.id !== 'number' || typeof message.command !== 'string') return
    try {
      const result = await dispatch(message.command as CommandName, message.payload)
      scope.postMessage({ id: message.id, ok: true, result })
    } catch (error) {
      scope.postMessage({ id: message.id, ok: false, error: rpcError(error) })
    }
  })
}
