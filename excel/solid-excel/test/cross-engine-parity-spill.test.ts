/**
 * ALWAYS-ON 跨引擎烟测 —— **溢出（spill）的生命周期**：动态数组在两个引擎上必须
 * 以同样的方式装上、存下来、以及在被写入时收回与复活。
 *
 * 求值语义（同一个公式算出什么）在兄弟文件 `cross-engine-parity-smoke.test.ts`。
 * 分开的理由是失败时要回答的问题不同：那边问「这个函数的语义对不对」，这边问
 * 「这片数组的**状态机**走对了没有」—— 后者的每一条都要跨越一次真实的引擎状态
 * 转移（bulk 导入 / 快照往返 / 写入塌缩），断言的是几何而不是数值。
 *
 * 三条各自钉住一个曾经活着的缺陷：
 *
 * 1. **bulk 导入建投影** —— WASM 的 `bulk_install_workbook` 曾经一个投影都不装，
 *    于是**导入**的工作簿里每个动态数组只显示左上角一个值。闭式断言（整列必须是
 *    1..10）是关键：「两侧相等」在两个引擎都只显示左上角时同样成立。
 * 2. **快照往返保住活投影** —— 稀疏快照曾把投影值烙成字面量，于是存档重载后
 *    anchor 自己的矩形被这些字面量占住，整片变 `#SPILL!`。所以这里断言的是
 *    「restore 之后它仍然是**活的**投影」，不只是「值看起来对」。
 * 3. **写入塌缩与复活** —— ADR 0006 的核心语义。往投影格写入时 Rust 曾经拒绝并
 *    丢弃输入，而 TS 参考引擎（与 Excel）让它落地、anchor 变 `#SPILL!`；清掉阻塞
 *    物后数组复活。这条曾让被门控的 scale 套件在 P2/P4/P5 各红 22 格。
 *    见 `docs/decisions/0006-spill-region-write-semantics.md`。
 *
 * 必须两个引擎：整个缺陷形态就是「同一次按键，一个引擎答得和另一个不一样」。
 *
 * 这里失败就是一条**真的**跨引擎发现：报告分歧地址，不要放宽断言。
 */

import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import {
  displaysOf,
  flatten,
  loadWasmModule,
  makeEngine,
  type Engine,
  type EngineLabel,
} from './cross-engine-parity-engines'
import {
  BLOCKED_1D,
  PROBE_ADDRS,
  SEQ_10,
  SEQ_4X3,
  SHRUNK_1D,
  SHRUNK_2D,
  SPILL_1D,
  SPILL_2D,
  WORKLOAD,
} from './cross-engine-parity-cases'

describe('cross-engine parity — spill lifecycle (TS runtime vs WASM engine)', () => {
  let ts: Engine
  let wasm: Engine

  beforeAll(async () => {
    await loadWasmModule()
    ts = makeEngine('ts')
    wasm = makeEngine('wasm')
    await ts.bulkImport(WORKLOAD)
    await wasm.bulkImport(WORKLOAD)
  }, 30_000)

  afterAll(() => {
    wasm?.dispose()
    ts?.dispose()
  })

  test('bulk import projects both spill shapes identically on both engines', async () => {
    const tsRead = await ts.read(PROBE_ADDRS)
    const wasmRead = await wasm.read(PROBE_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form, so "identical" cannot be satisfied by both engines being
    // equally wrong — this is what the WASM bulk-import defect (top-left
    // scalar only, no projection installed) failed.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, SPILL_1D)).toEqual(SEQ_10)
      expect(displaysOf(read, SPILL_2D)).toEqual(SEQ_4X3)
      expect(read.get('H11')?.display).toBe('') // one row past the 1-D spill
    }
  })


  test('persistence roundtrip keeps a LIVE spill projection on both engines', async () => {
    const before: Record<EngineLabel, string[]> = {
      ts: flatten(await ts.read(PROBE_ADDRS)),
      wasm: flatten(await wasm.read(PROBE_ADDRS)),
    }
    const restored: Record<EngineLabel, Engine> = {
      ts: makeEngine('ts'),
      wasm: makeEngine('wasm'),
    }
    try {
      for (const label of ['ts', 'wasm'] as const) {
        await restored[label].restore(await (label === 'ts' ? ts : wasm).snapshot())
        // Per-engine roundtrip: restore reproduces the pre-snapshot state.
        expect(flatten(await restored[label].read(PROBE_ADDRS))).toEqual(before[label])
      }
      // Cross-engine equality of the two restored workbooks.
      expect(flatten(await restored.wasm.read(PROBE_ADDRS))).toEqual(
        flatten(await restored.ts.read(PROBE_ADDRS)),
      )

      // Displays alone cannot tell a live projection from literals baked
      // into the snapshot — both read `1..10`. So re-point each ANCHOR at a
      // SHORTER array: a live region shrinks with it and the vacated cells
      // go blank, while a frozen copy either refuses the write or keeps the
      // old numbers in the rows the new array no longer covers.
      for (const engine of [restored.ts, restored.wasm]) {
        await engine.setFormula('H1', '=SEQUENCE(3,1,100,1)')
        await engine.setFormula('J1', '=SEQUENCE(2,2,50,1)')
      }
      const afterTs = await restored.ts.read(PROBE_ADDRS)
      const afterWasm = await restored.wasm.read(PROBE_ADDRS)
      expect(flatten(afterWasm)).toEqual(flatten(afterTs))
      for (const read of [afterTs, afterWasm]) {
        expect(displaysOf(read, SPILL_1D)).toEqual(SHRUNK_1D)
        expect(displaysOf(read, SPILL_2D)).toEqual(SHRUNK_2D)
      }
    } finally {
      restored.wasm.dispose()
      restored.ts.dispose()
    }
  }, 30_000)

  // Runs LAST and hands the workbook back exactly as it found it, so the
  // shared fixture above stays valid regardless of jest ordering.
  test('a spill-region write withdraws the array on both engines, and revives', async () => {
    const bothRead = async () => {
      const tsRead = await ts.read(PROBE_ADDRS)
      const wasmRead = await wasm.read(PROBE_ADDRS)
      // Cross-engine equality FIRST: this is the divergence ADR 0006 closed.
      expect(flatten(wasmRead)).toEqual(flatten(tsRead))
      return [tsRead, wasmRead]
    }

    // Clearing a ghost cell is LAZY on both engines — a blank cannot block a
    // spill, so nothing collapses. Asserting it here (not just in the
    // single-engine suites) is what stops one engine going eager later.
    for (const engine of [ts, wasm]) await engine.clearCell('H3')
    for (const read of await bothRead()) expect(displaysOf(read, SPILL_1D)).toEqual(SEQ_10)

    // Typing a real value into the same ghost cell DOES collapse it. Closed
    // form, so "identical" cannot be satisfied by both engines refusing the
    // write (the old Rust behaviour would read `1..10` here) nor by both
    // withdrawing and losing the keystroke (`H3` would read blank).
    for (const engine of [ts, wasm]) await engine.setText('H3', 'blocker')
    for (const read of await bothRead()) {
      expect(displaysOf(read, SPILL_1D)).toEqual(BLOCKED_1D)
      expect(read.get('H1')?.isError).toBe(true)
      // The unrelated 2-D array must not be disturbed by its neighbour.
      expect(displaysOf(read, SPILL_2D)).toEqual(SEQ_4X3)
    }

    // Phase 2: removing the blocker revives the array on both engines.
    for (const engine of [ts, wasm]) await engine.clearCell('H3')
    for (const read of await bothRead()) expect(displaysOf(read, SPILL_1D)).toEqual(SEQ_10)
  }, 30_000)
})
