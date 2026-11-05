/// <reference lib="WebWorker" />

import type { VisibleProjectionRequest } from '../../contracts'
import { createAsyncFormulaIo, type AsyncFormulaIo } from '../async-formulas/io'
import type { RustWorkbookCommands, RustWorkbookSheet } from '../commands'
import type { RustWasmModule, WasmWorkbook } from '../wasm-types'
import { readVisibleProjection } from '../visible-projection'

export type CommandName = keyof RustWorkbookCommands
export type CommandPayload<C extends CommandName> = RustWorkbookCommands[C]['payload']

/** Worker 内唯一 Rust 工作簿的可变状态；各命令处理器共享同一份。 */
export interface RuntimeContext {
  readonly wasm: RustWasmModule
  readonly scope: DedicatedWorkerGlobalScope
  readonly sheetsById: Map<string, RustWorkbookSheet>
  workbook: WasmWorkbook | undefined
  revision: number
  asyncFormulas: AsyncFormulaIo | undefined
  painterToken: string | undefined
  pendingClipboard: { token: string; cut: boolean; revision: number } | undefined
  clipboard: { token: string; cut: boolean; consumed?: boolean; invalidated?: boolean } | undefined
  ensureWasm(): Promise<void>
  currentWorkbook(): WasmWorkbook
  sheetIndex(sheetId: string): number
  /** 这些元数据命令共用一次版本推进和一次投影，不为每种功能重复接线。 */
  projectChange(changed: boolean,
    input: { sheetId: string; projection: VisibleProjectionRequest }): {
    changed: boolean
    projection: ReturnType<typeof readVisibleProjection>
  }
  /** 换上新工作簿：建好异步公式 IO 才释放旧簿，失败时只释放新簿。 */
  adopt(next: WasmWorkbook, sheets: readonly RustWorkbookSheet[]): void
}

export function createRuntimeContext(wasm: RustWasmModule): RuntimeContext {
  let initPromise: Promise<unknown> | undefined
  const context: RuntimeContext = {
    wasm,
    scope: self as unknown as DedicatedWorkerGlobalScope,
    sheetsById: new Map(),
    workbook: undefined,
    revision: 0,
    asyncFormulas: undefined,
    painterToken: undefined,
    pendingClipboard: undefined,
    clipboard: undefined,
    async ensureWasm() {
      initPromise ??= wasm.default()
      await initPromise
    },
    currentWorkbook() {
      if (!context.workbook)
        throw Object.assign(new Error('Workbook is not initialized'), { code: 'NOT_READY' })
      return context.workbook
    },
    sheetIndex(sheetId) {
      const sheet = context.sheetsById.get(sheetId)
      if (!sheet || sheet.index < 0)
        throw Object.assign(new Error(`Unknown sheet: ${sheetId}`), { code: 'INVALID_SHEET' })
      return sheet.index
    },
    projectChange(changed, input) {
      if (changed) context.revision += 1
      return { changed, projection: readVisibleProjection(
        context.currentWorkbook(), context.sheetIndex(input.sheetId), input.projection,
        context.revision,
      ) }
    },
    adopt(next, sheets) {
      let io: AsyncFormulaIo
      try {
        io = createAsyncFormulaIo(next, context.scope.location.origin,
          () => { context.revision += 1 })
      } catch (error) {
        next.free?.()
        throw error
      }
      context.asyncFormulas?.dispose()
      context.workbook?.free?.()
      context.workbook = next
      context.asyncFormulas = io
      context.revision = 0
      context.clipboard = undefined
      context.pendingClipboard = undefined
      context.painterToken = undefined
      context.sheetsById.clear()
      for (const sheet of sheets) context.sheetsById.set(sheet.id, sheet)
    },
  }
  return context
}

/** 需要已初始化工作簿的命令处理器。 */
export type WorkbookHandler<C extends CommandName> = (
  context: RuntimeContext, current: WasmWorkbook, payload: CommandPayload<C>,
) => unknown

export type WorkbookHandlers = { readonly [C in CommandName]?: WorkbookHandler<C> }
