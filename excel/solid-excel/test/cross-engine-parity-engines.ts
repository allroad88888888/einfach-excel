/**
 * One common driver surface over BOTH spreadsheet engines, for cross-engine
 * parity specs. Not a test file — see `cross-engine-parity-smoke.test.ts`
 * for the always-on scenarios built on top of it.
 *
 *   - TS   — `createWorkerRuntimeTs().handle()`, the same RPC surface the
 *            real Worker runs. Bulk path: beginImport → importChunk →
 *            commitImport.
 *   - WASM — `WasmWorkbook` from `excel/solid-excel/wasm-pkg/`, called
 *            through the wasm-bindgen methods DIRECTLY rather than through
 *            `worker-runtime.ts`: that dispatcher auto-installs onto `self`
 *            at module load and cannot be instantiated twice cleanly under
 *            jest, so a two-engine file cannot use it (same workaround as
 *            `scale-parity.test.ts` / `perf-ts-vs-wasm.bench.ts`). Bulk
 *            path: `bulk_install_workbook`.
 *
 * Both drivers are node-side: no browser, no real Worker. `wasm-pkg/` is
 * the LITE build (no REGEX* functions) — keep workloads off them.
 *
 * Scope note: single-cell writes may target ANY address, spill projections
 * included. That used to be forbidden here — the Rust engine refused such a
 * write while the TS engine let it land — but ADR 0006 phases 1/2 made both
 * engines agree on Excel's semantics, so the case is now a parity SCENARIO
 * rather than a driver restriction. The WASM side deliberately calls the
 * FALLIBLE `try*` bindings and asserts `ok`, so a re-introduced engine-side
 * refusal fails loudly here instead of reading back as a silent no-op.
 */
import { expect } from '@jest/globals'
import { existsSync, readFileSync } from 'node:fs'
import { TextDecoder, TextEncoder } from 'node:util'
import path from 'node:path'

import { createWorkerRuntimeTs } from '../src-vnext/adapter/worker-runtime-ts'
import { a1 } from './parity-seed'

export { a1 }

// jsdom under jest exposes no TextDecoder/TextEncoder; the wasm-bindgen glue
// grabs them at module-load time, so patch globals BEFORE the wasm import.
const g = globalThis as unknown as {
  TextDecoder: typeof TextDecoder
  TextEncoder: typeof TextEncoder
}
if (!g.TextDecoder) g.TextDecoder = TextDecoder
if (!g.TextEncoder) g.TextEncoder = TextEncoder

const WASM_PKG_JS = path.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm.js')
const WASM_PKG_BIN = path.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm_bg.wasm')

/** Every driver here works on a single sheet at index 0. */
const SHEET = 'Sheet1'

export type WorkloadCell =
  | { row: number; col: number; kind: 'number'; value: number }
  | { row: number; col: number; kind: 'formula'; value: string }

export interface Cell {
  display: string
  isError: boolean
}
export type Reading = Map<string, Cell>
export type EngineLabel = 'ts' | 'wasm'

export interface Engine {
  readonly label: EngineLabel
  bulkImport(cells: readonly WorkloadCell[]): Promise<void>
  read(addrs: readonly string[]): Promise<Reading>
  setFormula(addr: string, formula: string): Promise<void>
  /** Text literal — the canonical spill BLOCKER. */
  setText(addr: string, text: string): Promise<void>
  clearCell(addr: string): Promise<void>
  snapshot(): Promise<unknown>
  restore(snapshot: unknown): Promise<void>
  dispose(): void
}

// --- TS engine -------------------------------------------------------------
function makeTsEngine(): Engine {
  const rt = createWorkerRuntimeTs()
  let rpcId = 0
  const rpc = async (msg: Record<string, unknown>) => {
    rpcId += 1
    const resp = await rt.handle({ id: rpcId, ...msg } as never)
    if (!resp.ok) {
      throw new Error(`ts rpc ${String(msg.cmd)}: ${resp.error.code} ${resp.error.message}`)
    }
    return resp.result
  }
  return {
    label: 'ts',
    async bulkImport(cells) {
      await rpc({ cmd: 'initWorkbook', sheets: [SHEET] })
      const sessionId = (await rpc({ cmd: 'beginImport', mode: 'atomic' })) as number
      await rpc({ cmd: 'importChunk', sessionId, cells: cells.map((c) => ({ sheet: 0, ...c })) })
      const stats = (await rpc({ cmd: 'commitImport', sessionId })) as {
        accepted: number
        rejectedFormulas: number
      }
      // Counter, not clock: the bulk path must have taken the whole workload.
      expect(stats.accepted).toBe(cells.length)
      expect(stats.rejectedFormulas).toBe(0)
    },
    async read(addrs) {
      const snaps = (await rpc({
        cmd: 'readCells',
        cells: addrs.map((addr) => ({ sheet: 0, addr })),
      })) as Array<{ display: string; isError: boolean }>
      const out: Reading = new Map()
      addrs.forEach((addr, i) => {
        out.set(addr, { display: snaps[i].display, isError: snaps[i].isError })
      })
      return out
    },
    async setFormula(addr, formula) {
      await rpc({ cmd: 'setFormula', sheet: 0, addr, formula })
    },
    async setText(addr, text) {
      await rpc({ cmd: 'setCell', sheet: 0, addr, value: { type: 'text', value: text } })
    },
    async clearCell(addr) {
      await rpc({ cmd: 'clearCell', sheet: 0, addr })
    },
    async snapshot() {
      return rpc({ cmd: 'snapshotPersistenceV1' })
    },
    async restore(snapshot) {
      await rpc({ cmd: 'restorePersistenceV1', snapshot })
    },
    dispose() {
      // GC'd with the closure.
    },
  }
}

// --- WASM engine -----------------------------------------------------------
interface WasmWorkbookLike {
  rename_sheet(idx: number, name: string): boolean
  bulk_install_workbook(payload: unknown): unknown
  snapshotCell(sheet: number, addr: string): { display: string; isError: boolean }
  trySetFormulaAt(sheet: number, addr: string, src: string): unknown
  trySetCellText(sheet: number, addr: string, value: string): unknown
  tryClearCellAt(sheet: number, addr: string): unknown
  snapshot_persistence_v1(): unknown
  restore_persistence_v1(snapshot: unknown): unknown
  free(): void
}
interface WasmModuleShape {
  default: (init?: { module_or_path: ArrayBufferLike }) => Promise<unknown>
  WasmWorkbook: new () => WasmWorkbookLike
}

let wasmModule: WasmModuleShape | undefined

/** Must be awaited once (in `beforeAll`) before `makeEngine('wasm')`. */
export async function loadWasmModule(): Promise<void> {
  if (wasmModule) return
  if (!existsSync(WASM_PKG_JS) || !existsSync(WASM_PKG_BIN)) {
    throw new Error(`cross-engine parity: wasm-pkg missing at ${WASM_PKG_JS} — run build:wasm`)
  }
  const mod = (await import(WASM_PKG_JS)) as WasmModuleShape
  const bytes = readFileSync(WASM_PKG_BIN)
  await mod.default({
    module_or_path: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  wasmModule = mod
}

/**
 * The `try*` bindings answer `{ ok: false, code, anchor? }` when the engine
 * refuses. Assert `ok` so a refusal can never masquerade as "the write
 * landed and simply had no visible effect" — the exact confusion the old
 * infallible `set_cell_*` twins created.
 */
function expectWritten(outcome: unknown, addr: string): void {
  // The addr rides along so a jest diff names the cell that was refused.
  expect({ addr, ok: (outcome as { ok?: unknown } | null)?.ok, outcome }).toEqual({
    addr,
    ok: true,
    outcome,
  })
}

function makeWasmEngine(): Engine {
  if (!wasmModule) throw new Error('wasm module not loaded — await loadWasmModule() first')
  const wb = new wasmModule.WasmWorkbook()
  return {
    label: 'wasm',
    async bulkImport(cells) {
      wb.rename_sheet(0, SHEET)
      const primitives: Array<[string, unknown]> = []
      const formulas: Array<[string, string]> = []
      for (const cell of cells) {
        const addr = a1(cell.row, cell.col)
        if (cell.kind === 'formula') formulas.push([addr, cell.value])
        else primitives.push([addr, cell.value])
      }
      const stats = wb.bulk_install_workbook([{ sheet: 0, primitives, formulas }]) as Array<{
        primitivesInstalled: number
        formulasInstalled: number
      }>
      expect(stats.reduce((n, s) => n + s.primitivesInstalled, 0)).toBe(primitives.length)
      expect(stats.reduce((n, s) => n + s.formulasInstalled, 0)).toBe(formulas.length)
    },
    async read(addrs) {
      const out: Reading = new Map()
      for (const addr of addrs) {
        const snap = wb.snapshotCell(0, addr)
        out.set(addr, { display: snap.display, isError: snap.isError })
      }
      return out
    },
    async setFormula(addr, formula) {
      expectWritten(wb.trySetFormulaAt(0, addr, formula), addr)
    },
    async setText(addr, text) {
      expectWritten(wb.trySetCellText(0, addr, text), addr)
    },
    async clearCell(addr) {
      expectWritten(wb.tryClearCellAt(0, addr), addr)
    },
    async snapshot() {
      return wb.snapshot_persistence_v1()
    },
    async restore(snapshot) {
      wb.restore_persistence_v1(snapshot)
    },
    dispose() {
      wb.free()
    },
  }
}

export function makeEngine(label: EngineLabel): Engine {
  return label === 'ts' ? makeTsEngine() : makeWasmEngine()
}

/** `addr=display` (plus an error marker) so a jest array diff names the cells. */
export function flatten(reading: Reading): string[] {
  return [...reading].map(
    ([addr, cell]) => `${addr}=${cell.display}${cell.isError ? ' <err>' : ''}`,
  )
}
export function displaysOf(reading: Reading, addrs: readonly string[]): string[] {
  return addrs.map((addr) => reading.get(addr)?.display ?? '<unsampled>')
}
