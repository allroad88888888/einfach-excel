import type { WasmWorkbookRuntime, WorkerWasmModule } from './wasm-workbook-surface'

/**
 * worker 里那一个活的 wasm 工作簿实例，以及造出它所需的 wasm 模块命名空间。
 *
 * 模块命名空间是**注入**的（`bindWasmModule`），不是 import 来的 —— 这样
 * dispatcher 不必知道自己跑在 lite 还是 full 的产物上，选哪一份由薄入口决定。
 */

let wasm: WorkerWasmModule | undefined
let workbook: WasmWorkbookRuntime | undefined
let initPromise: Promise<void> | undefined

export function bindWasmModule(module: WorkerWasmModule) {
  wasm = module
}

function boundWasm(): WorkerWasmModule {
  if (!wasm) {
    throw Object.assign(new Error('worker runtime has no wasm module bound'), {
      code: 'WASM_MODULE_UNBOUND',
    })
  }
  return wasm
}

function newWorkbook(): WasmWorkbookRuntime {
  return new (boundWasm().WasmWorkbook)() as unknown as WasmWorkbookRuntime
}

export async function ensureInit() {
  if (!initPromise)
    initPromise = (async () => {
      await boundWasm().default()
    })()
  await initPromise
}

export async function ensureWorkbook(): Promise<WasmWorkbookRuntime> {
  await ensureInit()
  if (!workbook) workbook = newWorkbook()
  return workbook
}

/** 当前实例，可能还没造出来 —— 只给"重置前先清理旧实例"这类路径用。 */
export function currentWorkbook(): WasmWorkbookRuntime | undefined {
  return workbook
}

/** 丢掉旧实例，换一个只有 `sheets` 这些表的新工作簿。 */
export function replaceWorkbook(sheets?: string[]): WasmWorkbookRuntime {
  const wb = newWorkbook()
  if (sheets && sheets.length > 0) {
    wb.rename_sheet(0, sheets[0])
    for (const name of sheets.slice(1)) wb.add_sheet(name)
  }
  workbook = wb
  return wb
}

/** 与 `source` 表结构相同、内容为空的新工作簿 —— 原子导入的暂存壳。 */
export function createWorkbookShell(source: WasmWorkbookRuntime): WasmWorkbookRuntime {
  const wb = newWorkbook()
  if (source.sheet_count() > 0) {
    wb.rename_sheet(0, source.sheet_name(0))
    for (let idx = 1; idx < source.sheet_count(); idx++) wb.add_sheet(source.sheet_name(idx))
  }
  return wb
}
