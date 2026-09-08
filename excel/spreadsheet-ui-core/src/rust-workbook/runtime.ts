/// <reference lib="WebWorker" />

import type { BackendMutationResult } from '../backend'
import type { WorkerErrorWire, WorkerRequestWire } from '../rust-worker/types'
import { writeCellInput } from './cell-io'
import { exportClipboard } from './clipboard-export'
import { clearRange } from './clear-io'
import { writeImportedCellFormats, writeRangeFormat } from './format-io'
import type {
  RustImportCell,
  RustWorkbookCommands,
  RustWorkbookSheet,
  RustWorkbookSheetInput,
} from './commands'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'

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

/** 在 Worker 内维护唯一 Rust 工作簿，并处理 UI Core 的直接命令。 */
export function installRustWorkbookRuntime(wasm: RustWasmModule): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope
  const sheetsById = new Map<string, RustWorkbookSheet>()
  let workbook: WasmWorkbook | undefined
  let initPromise: Promise<unknown> | undefined
  let revision = 0
  let clipboard: { token: string; cut: boolean; consumed?: boolean } | undefined

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
    clipboard = undefined
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
    if (!workbook)
      throw Object.assign(new Error('Workbook is not initialized'), { code: 'NOT_READY' })
    return workbook
  }

  function sheetIndex(sheetId: string): number {
    const sheet = sheetsById.get(sheetId)
    if (!sheet)
      throw Object.assign(new Error(`Unknown sheet: ${sheetId}`), { code: 'INVALID_SHEET' })
    return sheet.index
  }

  async function dispatch(command: CommandName, payload: unknown): Promise<unknown> {
    if (command === 'workbook.initialize') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return initialize(input.sheets)
    }
    const current = currentWorkbook()
    if (command === 'clipboard.export') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return exportClipboard(current, sheetIndex(input.sheetId), input)
    }
    if (command === 'clipboard.capture') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      if (!current.capture_clipboard) throw new Error('Rust clipboard export is unavailable')
      const range = input.range
      const captured = current.capture_clipboard(
        sheetIndex(input.sheetId),
        range.rowStart,
        range.colStart,
        range.rowEnd,
        range.colEnd,
        input.cut,
      )
      clipboard = { token: crypto.randomUUID(), cut: input.cut }
      return { ...captured, token: clipboard.token }
    }
    if (command === 'workbook.importCells') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const cells = input.cells as readonly RustImportCell[]
      const stats = current.bulk_import_cells(cells)
      writeImportedCellFormats(current, cells)
      return stats
    }
    if (command === 'projection.readVisible') {
      const { request } = payload as RustWorkbookCommands[typeof command]['payload']
      return readVisibleProjection(
        current,
        sheetIndex(request.sheetId),
        request,
        request.revision ?? revision,
      )
    }
    if (command === 'cell.setInput') {
      const { request, projection } = payload as RustWorkbookCommands[typeof command]['payload']
      if (projection.sheetId !== request.sheetId) {
        throw Object.assign(new Error('Mutation and projection must target the same sheet'), {
          code: 'PROJECTION_SHEET_MISMATCH',
        })
      }
      writeCellInput(current, sheetIndex(request.sheetId), request.row, request.col, request.input)
      revision += 1
      const acknowledgement: BackendMutationResult = {
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
      return {
        acknowledgement,
        projection: readVisibleProjection(
          current,
          sheetIndex(projection.sheetId),
          projection,
          revision,
        ),
      }
    }
    if (
      command === 'format.setRange' ||
      command === 'range.clear' ||
      command === 'clipboard.paste'
    ) {
      const { request, projection } = payload as RustWorkbookCommands[typeof command]['payload']
      if (projection.sheetId !== request.sheetId) {
        throw Object.assign(new Error('Mutation and projection must target the same sheet'), {
          code: 'PROJECTION_SHEET_MISMATCH',
        })
      }
      let affectedRange
      if ('text' in request) {
        if (!current.paste_clipboard) throw new Error('Rust paste export is unavailable')
        const internal = !!request.token && request.token === clipboard?.token
        if (internal && clipboard?.consumed) throw new Error('CLIPBOARD_CUT_CONSUMED')
        const range = current.paste_clipboard(
          sheetIndex(request.sheetId),
          request.row,
          request.col,
          request.text,
          internal,
          request,
        )
        affectedRange = {
          rowStart: range[0],
          colStart: range[1],
          rowEnd: range[2],
          colEnd: range[3],
        }
        if (internal && clipboard?.cut) clipboard.consumed = true
      } else {
        if ('mode' in request) clearRange(current, sheetIndex(request.sheetId), request)
        else writeRangeFormat(current, sheetIndex(request.sheetId), request)
        affectedRange = { ...request.range }
      }
      revision += 1
      const acknowledgement: BackendMutationResult = {
        sheetId: request.sheetId,
        requestId: request.requestId,
        revision,
        affectedRange,
      }
      return {
        acknowledgement,
        projection: readVisibleProjection(
          current,
          sheetIndex(projection.sheetId),
          projection,
          revision,
        ),
      }
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
