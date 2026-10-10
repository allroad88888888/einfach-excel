/// <reference lib="WebWorker" />

import type { BackendMutationResult } from '../backend'
import type { WorkerRequestWire } from '../rust-worker/types'
import { rpcError } from '../rust-worker/transport'
import { writeTrackedMutation } from './tracked-mutation'
import { applyRustHistory } from './history-apply'
import { exportClipboard } from './clipboard-export'
import { changeSheetStructure } from './sheet-structure'
import { readSizes } from './size-io'
import { changeSize } from './resize-io'
import { findWorkbook, replaceWorkbook } from './find-io'
import { initializeWorkbook } from './initialize-workbook'
import { changeMerge } from './merge-io'
import { changeFreeze } from './freeze-io'
import { editWorkbookSheet } from './sheet-edit'
import { changeStructure } from './structure-io'
import { writeImportedCellFormats } from './format-io'
import type {
  RustWorkbookCommands,
  RustWorkbookSheet,
  RustWorkbookSheetInput,
} from './commands'
import type { RustWasmModule, WasmWorkbook } from './wasm-types'
import { readVisibleProjection } from './visible-projection'
import { changeVisibility } from './visibility-io'
import { sortRange } from './sort-io'
import { changeFilter } from './filter-io'

type CommandName = keyof RustWorkbookCommands

/** 在 Worker 内维护唯一 Rust 工作簿，并处理 UI Core 的直接命令。 */
export function installRustWorkbookRuntime(wasm: RustWasmModule): void {
  const scope = self as unknown as DedicatedWorkerGlobalScope
  const sheetsById = new Map<string, RustWorkbookSheet>()
  let workbook: WasmWorkbook | undefined
  let initPromise: Promise<unknown> | undefined
  let revision = 0
  let painterToken: string | undefined
  let clipboard:
    | { token: string; cut: boolean; consumed?: boolean; invalidated?: boolean }
    | undefined

  async function ensureWasm(): Promise<void> {
    initPromise ??= wasm.default()
    await initPromise
  }

  async function initialize(
    sheets: readonly RustWorkbookSheetInput[],
  ): Promise<RustWorkbookSheet[]> {
    await ensureWasm()
    const initialized = initializeWorkbook(wasm, sheets)
    workbook = initialized.workbook
    revision = 0
    clipboard = undefined
    painterToken = undefined
    sheetsById.clear()
    for (const sheet of initialized.sheets) sheetsById.set(sheet.id, sheet)
    return initialized.sheets
  }

  function currentWorkbook(): WasmWorkbook {
    if (!workbook)
      throw Object.assign(new Error('Workbook is not initialized'), { code: 'NOT_READY' })
    return workbook
  }

  function sheetIndex(sheetId: string): number {
    const sheet = sheetsById.get(sheetId)
    if (!sheet || sheet.index < 0)
      throw Object.assign(new Error(`Unknown sheet: ${sheetId}`), { code: 'INVALID_SHEET' })
    return sheet.index
  }

  async function dispatch(command: CommandName, payload: unknown): Promise<unknown> {
    if (command === 'workbook.initialize') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return initialize(input.sheets)
    }
    const current = currentWorkbook()
    if (command === 'format.preview') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      if (!current.preview_number_format) throw new Error('Rust number format preview is unavailable.')
      // 只读单格结果，不推进修订号，也不发布投影或创建历史事务。
      return current.preview_number_format(
        sheetIndex(input.sheetId), input.addr, input.numberFormat,
      )
    }
    if (command === 'sheet.filter') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const index = sheetIndex(input.sheetId)
      const columns = sheetsById.get(input.sheetId)!.colCount ?? 16_384
      const hiddenRows = changeFilter(
        current, index, columns, input, sheetsById.get(input.sheetId)!.rowCount,
      )
      revision += 1
      return {
        hiddenRows, projection: readVisibleProjection(current, index, input.projection, revision),
      }
    }
    if (command === 'range.sort') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const index = sheetIndex(input.sheetId)
      const movedRows = sortRange(current, index, input)
      if (movedRows > 0) {
        revision += 1
        // 剪切快照的坐标不再代表原记录；排序后必须重新剪切。
        if (clipboard?.cut) clipboard.invalidated = true
      }
      return {
        movedRows, projection: readVisibleProjection(current, index, input.projection, revision),
      }
    }
    if (command === 'selection.aggregate') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      if (!current.aggregate_selection) throw new Error('Rust aggregate command is unavailable.')
      const targets = input.targets.map(({ sheetId, range }) => ({
        ...range,
        sheet: sheetIndex(sheetId),
      }))
      return { ...current.aggregate_selection(targets), revision }
    }
    if (command === 'workbook.find')
      return findWorkbook(
        current,
        sheetsById,
        payload as RustWorkbookCommands[typeof command]['payload'],
        revision,
      )
    if (command === 'workbook.replace') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const result = replaceWorkbook(current, sheetsById, input, revision)
      // 写入完成即推进版本；后面的投影读取失败也不能让旧查询再次写入。
      if (result.cells > 0) revision += 1
      const index = sheetIndex(input.projection.sheetId)
      return {
        ...result,
        projection: readVisibleProjection(current, index, input.projection, revision),
        sizes: readSizes(current, index, {
          rowStart: 0,
          colStart: 0,
          rowEnd: 1_048_575,
          colEnd: 16_383,
        }),
      }
    }
    if (command === 'sheet.freeze') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      sheetIndex(input.sheetId)
      const result = changeFreeze(current, sheetsById.get(input.sheetId)!, input, revision)
      if (result.changed) revision += 1
      return result
    }
    if (command === 'range.merge') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const result = changeMerge(current, sheetIndex(input.sheetId), input, revision)
      if (result.changed) revision += 1
      return result
    }
    if (command === 'sheet.editStructure') {
      const result = changeStructure(
        current,
        sheetsById,
        payload as RustWorkbookCommands[typeof command]['payload'],
        revision + 1,
      )
      revision += 1
      if (clipboard) clipboard.invalidated = true
      painterToken = undefined
      return result
    }
    if (command === 'history.apply') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const result = applyRustHistory(current, sheetsById, input, revision + 1)
      revision += 1
      if (result.sheets && clipboard) clipboard.invalidated = true
      if (result.sheets) painterToken = undefined
      return result
    }
    if (command === 'range.resize') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const index = sheetIndex(input.sheetId)
      changeSize(current, index, input)
      revision += 1
      return {
        projection: readVisibleProjection(current, index, input.projection, revision),
        sizes: readSizes(current, index, input.range),
      }
    }
    if (command === 'range.visibility') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      if (input.sheetId !== input.projection.sheetId) throw new Error('PROJECTION_SHEET_MISMATCH')
      const index = sheetIndex(input.sheetId)
      const changed = changeVisibility(current, index, input, sheetsById.get(input.sheetId)!)
      if (changed) revision += 1
      return {
        changed,
        projection: readVisibleProjection(current, index, input.projection, revision),
      }
    }
    if (command === 'workbook.changeSheets') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const sheets = changeSheetStructure(current, sheetsById, input)
      painterToken = undefined
      revision += 1
      return {
        sheets,
        revision,
        ...(input.projection
          ? {
              projection: readVisibleProjection(
                current,
                sheetIndex(input.projection.sheetId),
                input.projection,
                revision,
              ),
            }
          : {}),
      }
    }
    if (command === 'workbook.editSheet') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const result = editWorkbookSheet(current, sheetsById, input, revision + 1)
      painterToken = undefined
      revision += 1
      return result
    }
    if (command === 'clipboard.export') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      return exportClipboard(current, sheetIndex(input.sheetId), input)
    }
    if (command === 'clipboard.capture') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const capture = input.painter ? current.capture_format_painter : current.capture_clipboard
      if (!capture) throw new Error('Rust clipboard export is unavailable')
      if (input.painter && input.cut) throw new Error('CLIPBOARD_INVALID_POLICY')
      const range = input.range
      const coordinates = [
        sheetIndex(input.sheetId), range.rowStart, range.colStart, range.rowEnd, range.colEnd,
      ] as const
      const captured = input.painter
        ? current.capture_format_painter!(...coordinates)
        : current.capture_clipboard!(...coordinates, input.cut)
      if (input.painter) {
        painterToken = crypto.randomUUID()
        return { ...captured, token: painterToken }
      }
      clipboard = { token: crypto.randomUUID(), cut: input.cut }
      return { ...captured, token: clipboard.token }
    }
    if (command === 'workbook.importCells') {
      const input = payload as RustWorkbookCommands[typeof command]['payload']
      const stats = current.bulk_import_cells(input.cells)
      writeImportedCellFormats(current, input.cells)
      current.history_clear?.('')
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
    if (
      command === 'cell.setInput' ||
      command === 'format.setRange' ||
      command === 'range.clear' ||
      command === 'range.fill' ||
      command === 'clipboard.paste'
    ) {
      const { request, projection } = payload as RustWorkbookCommands[typeof command]['payload']
      // 跨表公式编辑：写入原单元格，但返回正在浏览表的真实投影。
      if (command !== 'cell.setInput' && projection.sheetId !== request.sheetId) {
        throw Object.assign(new Error('Mutation and projection must target the same sheet'), {
          code: 'PROJECTION_SHEET_MISMATCH',
        })
      }
      // 先校验浏览表存在，不能写完才发现投影目标已失效。
      const projectionSheet = sheetIndex(projection.sheetId)
      const fontSizeWrite = 'format' in request && request.format?.fontSize !== undefined
      if (fontSizeWrite && !current.snapshot_viewport_sizes)
        throw new Error('Rust size snapshot is unavailable.')
      let affectedRange
      let colWidths
      if ('text' in request) {
        if (!current.paste_clipboard) throw new Error('Rust paste export is unavailable')
        if (request.mode === 'column-widths' && !current.snapshot_viewport_sizes)
          throw new Error('Rust size snapshot is unavailable.')
        const internal = !!request.token &&
          request.token === (request.painter ? painterToken : clipboard?.token)
        if (request.painter && !internal) throw new Error('CLIPBOARD_SHEET_HISTORY_CHANGED')
        if (!request.painter && internal && clipboard?.consumed) throw new Error('CLIPBOARD_CUT_CONSUMED')
        if (!request.painter && internal && clipboard?.invalidated)
          throw new Error('CLIPBOARD_SHEET_HISTORY_CHANGED')
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
        if (request.mode === 'column-widths')
          colWidths = readSizes(current, sheetIndex(request.sheetId), affectedRange).colWidths
        if (!request.painter && internal && clipboard?.cut) clipboard.consumed = true
      } else {
        affectedRange = writeTrackedMutation(current, sheetIndex(request.sheetId), request)
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
        ...('direction' in request || fontSizeWrite
          ? { sizes: readSizes(current, sheetIndex(request.sheetId),
            'range' in request ? request.range : affectedRange) } : {}),
        ...(colWidths ? { colWidths } : {}),
        projection: readVisibleProjection(
          current,
          projectionSheet,
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
