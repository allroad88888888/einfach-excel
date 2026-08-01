/**
 * `ParityEngine` 的 **WASM 引擎**实现：直接驱动 `wasm-pkg/` 的 `WasmWorkbook`。
 *
 * 为什么不走 `worker-runtime.ts` 的 dispatcher：它在模块加载时自动装到 `self`
 * 上，jest 里没法干净地装第二次。所以这里调的是 dispatcher 会调的那批
 * wasm-bindgen 方法（`perf-ts-vs-wasm.bench.ts` 同样的绕法）。
 *
 * bulk 路径：`bulk_install_workbook`（storage-primary，Phase 6.2）。
 */
import { expect } from '@jest/globals'
import { existsSync, readFileSync } from 'node:fs'
import { TextDecoder, TextEncoder } from 'node:util'
import path from 'node:path'

import { a1 } from './parity-seed'
import { SHEET_NAMES } from './scale-parity-workload'
import {
  refKey,
  type ParityEngine,
  type PersistenceSnapshot,
  type SampledCell,
} from './scale-parity-engine-types'

// jsdom under jest doesn't expose TextDecoder/TextEncoder; the wasm-bindgen
// glue grabs them at module-load time, so patch globals BEFORE importing
// the wasm module (same trick as perf-ts-vs-wasm.bench.ts).
const g = globalThis as unknown as {
  TextDecoder: typeof TextDecoder
  TextEncoder: typeof TextEncoder
}
if (!g.TextDecoder) g.TextDecoder = TextDecoder
if (!g.TextEncoder) g.TextEncoder = TextEncoder

const WASM_PKG_JS = path.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm.js')
const WASM_PKG_BIN = path.join(__dirname, '..', 'wasm-pkg', 'einfach_wasm_bg.wasm')

type WasmWorkbookCtor = new () => WasmWorkbookLike
interface WasmModuleShape {
  default: (init?: { module_or_path: ArrayBufferLike }) => Promise<unknown>
  WasmWorkbook: WasmWorkbookCtor
}

interface WasmWorkbookLike {
  rename_sheet(idx: number, name: string): boolean
  add_sheet(name: string): number
  bulk_install_workbook(payload: unknown): unknown
  snapshotCell(
    sheet: number,
    addr: string,
  ): {
    sheet: number
    addr: string
    display: string
    type: string
    isError: boolean
    formula: string
  }
  set_cell_number(sheet: number, addr: string, value: number): void
  set_cell_text(sheet: number, addr: string, value: string): void
  clearCellAt(sheet: number, addr: string): void
  setFormulaAt(sheet: number, addr: string, src: string): boolean
  clear_range(
    sheet: number,
    startRow: number,
    startCol: number,
    endRow: number,
    endCol: number,
  ): number
  debug_formula_cache_state(sheet: number, addr: string): string
  snapshot_persistence_v1(): unknown
  restore_persistence_v1(snapshot: unknown): unknown
  free(): void
}

let WasmModule: WasmModuleShape | undefined

export async function loadWasmModule(): Promise<WasmModuleShape> {
  if (WasmModule) return WasmModule
  if (!existsSync(WASM_PKG_JS) || !existsSync(WASM_PKG_BIN)) {
    throw new Error(
      `scale-parity: wasm-pkg missing at ${WASM_PKG_JS} — run \`npm --prefix excel/solid-excel run build:wasm\``,
    )
  }
  const mod = (await import(WASM_PKG_JS)) as WasmModuleShape
  const bytes = readFileSync(WASM_PKG_BIN)
  await mod.default({
    module_or_path: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  })
  WasmModule = mod
  return mod
}

export function makeWasmEngine(
  existing?: WasmWorkbookLike,
): ParityEngine & { wb: WasmWorkbookLike } {
  if (!WasmModule) throw new Error('wasm module not loaded')
  const wb = existing ?? new WasmModule.WasmWorkbook()

  return {
    label: 'wasm',
    wb,
    async importWorkload(cells) {
      // Mirror worker-runtime.ts `resetWorkbook` sheet setup.
      wb.rename_sheet(0, SHEET_NAMES[0])
      for (const name of SHEET_NAMES.slice(1)) wb.add_sheet(name)
      // Storage-primary bulk install (Phase 6.2) — group per sheet.
      const bySheet = new Map<
        number,
        { sheet: number; primitives: Array<[string, unknown]>; formulas: Array<[string, string]> }
      >()
      for (let i = 0; i < SHEET_NAMES.length; i += 1) {
        bySheet.set(i, { sheet: i, primitives: [], formulas: [] })
      }
      for (const cell of cells) {
        const entry = bySheet.get(cell.sheet)
        if (!entry) throw new Error(`workload sheet out of range: ${cell.sheet}`)
        const addr = a1(cell.row, cell.col)
        if (cell.kind === 'formula') entry.formulas.push([addr, cell.value])
        else entry.primitives.push([addr, cell.value])
      }
      const stats = wb.bulk_install_workbook([...bySheet.values()]) as Array<{
        sheet: number
        primitivesInstalled: number
        formulasInstalled: number
      }>
      // Counter, not clock: install counts must cover the whole workload.
      const primitives = cells.filter((c) => c.kind !== 'formula').length
      const formulas = cells.length - primitives
      expect(stats.reduce((acc, s) => acc + s.primitivesInstalled, 0)).toBe(primitives)
      expect(stats.reduce((acc, s) => acc + s.formulasInstalled, 0)).toBe(formulas)
    },
    async readSamples(refs) {
      const out = new Map<string, SampledCell>()
      for (const ref of refs) {
        const snap = wb.snapshotCell(ref.sheet, ref.addr)
        out.set(refKey(ref), { display: snap.display, isError: snap.isError })
      }
      return out
    },
    async applyEdit(op) {
      switch (op.op) {
        case 'setNumber':
          wb.set_cell_number(op.sheet, op.addr, op.value)
          return
        case 'setText':
          wb.set_cell_text(op.sheet, op.addr, op.value)
          return
        case 'clearCell':
          wb.clearCellAt(op.sheet, op.addr)
          return
        case 'setFormula':
          wb.setFormulaAt(op.sheet, op.addr, op.formula)
          return
      }
    },
    async clearColumn(sheet, col) {
      return wb.clear_range(sheet, 0, col, 1_048_575, col)
    },
    async cacheState(sheet, addr) {
      return wb.debug_formula_cache_state(sheet, addr)
    },
    async snapshotPersistence() {
      return wb.snapshot_persistence_v1() as PersistenceSnapshot
    },
    async restoreIntoFresh(snapshot) {
      const fresh = makeWasmEngine()
      fresh.wb.restore_persistence_v1(snapshot)
      return fresh
    },
    dispose() {
      wb.free()
    },
  }
}

