import { readFileSync } from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { createStore, type Store } from '@einfach/core'
import * as lite from '../../../excel-wasm/lite/einfach_wasm.js'
import {
  createWorkbookApi,
  disposeRustWorkbookRuntimeAtom,
  runVisibleProjectionAtom,
  setSelectionAtom,
  setSelectionBoundsAtom,
  setViewportMetricsAtom,
  spreadsheetRuntimeAtom,
  startRustWorkbookRuntimeAtom,
  type RustWorkbookDefinition,
  type WorkbookApi,
} from '../../src'
import { installRustWorkbookRuntime } from '../../src/rust-workbook/runtime'
import type { RustWasmModule } from '../../src/rust-workbook/wasm-types'
import type { WorkerLike } from '../../src/rust-worker/types'

let initialized = false

function ensureLiteWasm(): RustWasmModule {
  if (!initialized) {
    lite.initSync({
      module: readFileSync(new NodeURL('../../../excel-wasm/lite/einfach_wasm_bg.wasm', import.meta.url)),
    })
    initialized = true
  }
  return {
    default: async () => undefined,
    WasmWorkbook: lite.WasmWorkbook as unknown as new () => unknown,
    function_catalog: lite.function_catalog as unknown as RustWasmModule['function_catalog'],
  }
}

export function createInMemoryWasmWorker(): WorkerLike {
  const wasm = ensureLiteWasm()
  const workerListeners = new Set<(event: MessageEvent) => void>()
  const hostListeners = new Set<(event: MessageEvent) => void>()
  let terminated = false

  const workerScope = {
    location: { origin: 'http://localhost', href: 'http://localhost/' },
    addEventListener(type: string, cb: (event: MessageEvent) => void) {
      if (type === 'message') workerListeners.add(cb)
    },
    removeEventListener(type: string, cb: (event: MessageEvent) => void) {
      if (type === 'message') workerListeners.delete(cb)
    },
    postMessage(data: unknown) {
      if (terminated) return
      queueMicrotask(() => {
        if (terminated) return
        for (const cb of [...hostListeners]) cb({ data } as MessageEvent)
      })
    },
  }

  const prevSelf = (globalThis as { self?: unknown }).self
  ;(globalThis as { self?: unknown }).self = workerScope
  try {
    installRustWorkbookRuntime(wasm)
  } finally {
    const globalRef = globalThis as { self?: unknown }
    globalRef.self = prevSelf
  }

  return {
    postMessage(data: unknown) {
      if (terminated) return
      queueMicrotask(() => {
        if (terminated) return
        for (const cb of [...workerListeners]) cb({ data } as MessageEvent)
      })
    },
    addEventListener(type, cb) {
      if (type === 'message') hostListeners.add(cb)
    },
    removeEventListener(type, cb) {
      if (type === 'message') hostListeners.delete(cb)
    },
    terminate() {
      terminated = true
      workerListeners.clear()
      hostListeners.clear()
    },
  }
}

export const DEFAULT_TEST_DEFINITION: RustWorkbookDefinition = {
  title: 'Test Workbook',
  sheets: [
    { id: 'orders', name: 'Orders', rowCount: 200, colCount: 26 },
    { id: 'summary', name: 'Summary', rowCount: 200, colCount: 26 },
  ],
  createImportChunks: () => [],
}

export async function setupRealWorkbookApi(options?: {
  readonly store?: Store
  readonly definition?: RustWorkbookDefinition
  readonly configureBeforeStart?: (api: WorkbookApi, store: Store) => void
}): Promise<{
  readonly store: Store
  readonly api: WorkbookApi
  readonly dispose: () => void
}> {
  const store = options?.store ?? createStore()
  const api = createWorkbookApi(store)
  options?.configureBeforeStart?.(api, store)
  await store.setter(startRustWorkbookRuntimeAtom, {
    definition: options?.definition ?? DEFAULT_TEST_DEFINITION,
    workerFactory: createInMemoryWasmWorker,
  })
  const rt = store.getter(spreadsheetRuntimeAtom)
  if (rt.status === 'error') throw new Error(`Runtime startup failed: ${rt.message}`)
  const firstSheet = api.getDocument().sheets[0]!
  store.setter(setSelectionBoundsAtom, {
    rowCount: firstSheet.rowCount,
    colCount: firstSheet.colCount,
  })
  store.setter(setSelectionAtom, {
    kind: 'cell',
    sheetId: firstSheet.id,
    anchor: { row: 0, col: 0 },
    focus: { row: 0, col: 0 },
  })
  store.setter(setViewportMetricsAtom, {
    sheetId: firstSheet.id,
    scrollTop: 0,
    scrollLeft: 0,
    viewportWidth: 800,
    viewportHeight: 400,
    rowHeight: 24,
    colWidth: 100,
    rowCount: firstSheet.rowCount,
    colCount: firstSheet.colCount,
    overscanRows: 2,
    overscanCols: 2,
  })
  await store.setter(runVisibleProjectionAtom, {
    sheetId: firstSheet.id,
    window: { rowStart: 0, rowEnd: 25, colStart: 0, colEnd: 10 },
    viewport: { height: 400, width: 800, rowHeight: 24, colWidth: 100 },
    reason: 'viewport',
  })
  return {
    store,
    api,
    dispose: () => store.setter(disposeRustWorkbookRuntimeAtom),
  }
}
