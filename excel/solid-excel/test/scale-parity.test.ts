/**
 * Adapter-level scale PARITY suite — `excel/rust/excel-core/docs/archive/
 * SCALE_TEST_SUITE_PLAN.md` ("Parity suite"): ONE seeded ~75k mixed workload
 * driven through BOTH worker runtimes, asserting identical observable state.
 *
 * 输入、驱动、比对分别住在：
 *   - `scale-parity-workload.ts`      工作负载（WORKLOAD_SEED）
 *   - `scale-parity-edits.ts`         P2 编辑序列（EDIT_SEED）
 *   - `scale-parity-engine-types.ts`  `ParityEngine` 契约
 *   - `scale-parity-engine-ts.ts`     TS 引擎驱动
 *   - `scale-parity-engine-wasm.ts`   WASM 引擎驱动
 *   - `scale-parity-compare.ts`       采样比对与失败报告
 * 本文件只剩规格本身。
 *
 * Phases（工作负载的组成见 `scale-parity-workload.ts` 的文件头）:
 *   P1 import parity    — 500 个确定性采样地址的 `display` / `isError` 一致，
 *                         外加闭式点检与**契约内**的 formula-cache 探针状态。
 *   P2 mutation parity  — 200 条播种编辑（含写入溢出区）后重采样一致。
 *   P3 structural parity— test.todo：TS core 无 band shift，`worker-runtime-ts.ts`
 *                         对 insert/deleteRows/Columns **fail closed**（结构化
 *                         `UNSUPPORTED`，与它 `structuralEdits: false` 的能力
 *                         证词一致）。下面有一条 guard 规格钉住这个拒绝的**形状**，
 *                         等 band shift 落到 TS runtime 时它会大声失败。
 *   P4 clearRange parity— 整列清除（e507222 稀疏路径）：清除计数是**闭式**的
 *                         （== 该列既有单元格数，而非 1M 稠密矩形）+ 后态一致。
 *   P5 restore parity   — snapshotPersistenceV1 → 全新 runtime → 各自 restore，
 *                         每引擎往返一致 + 跨引擎一致，再比对快照形状：表元数据
 *                         **全等**（曾因纯写不读的 `rowCount`/`colCount` 退化成
 *                         子集比对，字段已删，见该规格内注释）。
 *
 * ## 曾经被 `EINFACH_SCALE=1` 门控，2026-08-01 解禁
 *
 * 门控的**全部**理由是一句实测：「~4.5 min wall（2026-06-12），40× 超 always-on
 * 预算」。2026-08-01 现场复测：**4.7 s**。理由过期了约 57 倍，而这道门的代价是
 * 真金白银的 —— 它遮住的分歧不是假想：ADR 0006（溢出区写入语义）那条跨引擎分歧
 * 在 P2/P4/P5 各红 22 格，靠人手敲 `EINFACH_SCALE=1` 才被看见；同期还有
 * bulk-install 不建 spill 投影、`#TYPE!` 非 Excel 错误码两条。**一道默认不跑的
 * 网等于没有网。**
 *
 * 4.7 s 这个数**没有被断言**（本仓纪律：counters, not clocks），它只是解禁的依据。
 * 若哪天这里明显变慢，正确的反应是查为什么变慢，不是把门加回来。
 *
 * 其余纪律（同 SCALE_TEST_SUITE_PLAN 设计原则）：
 *   - deterministic: seeded LCG only — no Date.now / Math.random.
 *   - counters, not clocks: completion is asserted via cleared-cell /
 *     import-stat counters, never wall-time.
 *   - closed-form where possible: whole-col SUM == JS-computed seed sum.
 *
 * 单表最小烟测在 `cross-engine-parity-smoke.test.ts` —— 那份现在与本份都是
 * always-on，分工是「最小形状」对「播种规模」，不要合并。
 *
 * Documented divergences NOT asserted here (see
 * `excel/solid-excel/e2e/BACKEND_PARITY.md` § "What the debug-probe RPC
 * surfaces" and the file-level comment in
 * `excel-core-ts-debug-probes.test.ts`): the cache-probe state of an
 * ALREADY-READ formula after a mutation (TS-core is eager-on-mutation,
 * Rust-core purely lazy). Probe assertions below stick to the contractual
 * subset both backends agree on: never-read formula → 'dirty', after a
 * host-facing read → 'clean', literal cell → 'none'.
 *
 * If a parity spec here fails, that is a REAL finding — report the failing
 * addresses together with `WORKLOAD_SEED` / `EDIT_SEED`; do not patch
 * either engine to make the suite green.
 */
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals'

import { buildWorkload } from './scale-parity-workload'
import { buildEdits } from './scale-parity-edits'
import { refKey, type PersistenceSnapshot } from './scale-parity-engine-types'
import { makeTsEngine } from './scale-parity-engine-ts'
import { loadWasmModule, makeWasmEngine } from './scale-parity-engine-wasm'
import { expectParity } from './scale-parity-compare'

// ---------------------------------------------------------------------------
// Suite. Phases share one imported workbook pair — jest runs the specs in
// declaration order within the file.
// ---------------------------------------------------------------------------
describe('scale parity — one seeded ~75k workload through both worker runtimes', () => {
  const workload = buildWorkload()
  let tsEngine: ReturnType<typeof makeTsEngine>
  let wasmEngine: ReturnType<typeof makeWasmEngine>

  beforeAll(async () => {
    await loadWasmModule()
    tsEngine = makeTsEngine()
    wasmEngine = makeWasmEngine()
    await tsEngine.importWorkload(workload.cells)
    await wasmEngine.importWorkload(workload.cells)
  }, 60_000)

  afterAll(() => {
    wasmEngine?.dispose()
  })

  test(
    'P1 import parity — 500 sampled displays + error flags identical; closed forms; contractual probe states',
    async () => {
      // Contractual cache-probe states FIRST (before any read touches the
      // probe cells). Both backends agree on these three; post-mutation
      // probe semantics are a documented divergence and NOT asserted.
      const { neverRead, literal } = workload.probeRefs
      expect(await tsEngine.cacheState(neverRead.sheet, neverRead.addr)).toBe('dirty')
      expect(await wasmEngine.cacheState(neverRead.sheet, neverRead.addr)).toBe('dirty')
      expect(await tsEngine.cacheState(literal.sheet, literal.addr)).toBe('none')
      expect(await wasmEngine.cacheState(literal.sheet, literal.addr)).toBe('none')

      const tsSamples = await tsEngine.readSamples(workload.sampleRefs)
      const wasmSamples = await wasmEngine.readSamples(workload.sampleRefs)
      expectParity(tsSamples, wasmSamples, 'P1 import parity')

      // Closed form: whole-column SUM over Sheet1 A == JS-computed seed sum.
      const g1 = tsSamples.get('0:G1')
      expect(g1?.display).toBe(String(workload.sheet1ColASum))
      expect(wasmSamples.get('0:G1')?.display).toBe(String(workload.sheet1ColASum))
      // Error cells flagged on both engines.
      for (const addr of ['M1', 'M2', 'M3', 'M4']) {
        expect(tsSamples.get(`0:${addr}`)?.isError).toBe(true)
        expect(wasmSamples.get(`0:${addr}`)?.isError).toBe(true)
      }
      // Spill anchors resolved to non-empty, non-error displays.
      expect(tsSamples.get('0:H1')?.display).toBe('1')
      expect(wasmSamples.get('0:H1')?.display).toBe('1')

      // After a host-facing read, the probed formula reports 'clean' on
      // BOTH engines (still contractual — no mutation in between).
      await tsEngine.readSamples([neverRead])
      await wasmEngine.readSamples([neverRead])
      expect(await tsEngine.cacheState(neverRead.sheet, neverRead.addr)).toBe('clean')
      expect(await wasmEngine.cacheState(neverRead.sheet, neverRead.addr)).toBe('clean')
    },
    30_000,
  )

  test(
    'P2 mutation parity — 200 seeded edits (incl. spill-region writes) → identical re-sample',
    async () => {
      const edits = buildEdits()
      for (const op of edits) {
        await tsEngine.applyEdit(op)
        await wasmEngine.applyEdit(op)
      }
      const tsSamples = await tsEngine.readSamples(workload.sampleRefs)
      const wasmSamples = await wasmEngine.readSamples(workload.sampleRefs)
      expectParity(tsSamples, wasmSamples, 'P2 mutation parity')
    },
    30_000,
  )

  // P3 — structural parity. The TS core has no band shift, so
  // `worker-runtime-ts.ts` ('insertRows' / 'deleteRows' / 'insertColumns' /
  // 'deleteColumns' cases) fails CLOSED with a structured `UNSUPPORTED`
  // refusal. Driving structural ops through both engines would compare a
  // real WASM row shift against a refusal — not a parity signal.
  test.todo(
    'P3 structural parity — BLOCKED: TS core has no band shift, so the TS runtime refuses insertRows/deleteRows/insertColumns/deleteColumns (`structuralEdits: false`); enable once band shifts land',
  )

  test('P3 guard — TS structural ops fail closed with UNSUPPORTED (flip the todo above when this fails)', async () => {
    // NOT a parity assertion, and NOT a relaxed one: this guard pins the TS
    // runtime's DEGRADATION CONTRACT — what it is allowed to answer while
    // band shift is missing — so the todo above cannot rot silently.
    //
    // History (read this before "fixing" the guard again): it used to pin
    // the OPPOSITE, a success-shaped no-op `return true`. That stub was a
    // fake ACK — a host could not tell "nothing moved" from "rows moved" —
    // and `worker-runtime-ts.ts` deliberately replaced it with the refusal
    // asserted below. The old guard then failed loudly, which is exactly
    // what a guard is for; the fix was to re-point the guard at the new,
    // honest contract, NOT to restore the stub. When band shifts DO land,
    // these four commands stop refusing, this spec fails again, and THAT is
    // the signal to delete it and write real cross-engine P3 parity.
    const structuralCmds = [
      { cmd: 'insertRows', sheet: 0, rowIndex: 0, count: 3 },
      { cmd: 'deleteRows', sheet: 0, rowIndex: 0, count: 3 },
      { cmd: 'insertColumns', sheet: 0, colIndex: 0, count: 2 },
      { cmd: 'deleteColumns', sheet: 0, colIndex: 0, count: 2 },
    ]
    const before = await tsEngine.readSamples([{ sheet: 0, addr: 'A5' }])
    for (const msg of structuralCmds) {
      const resp = await tsEngine.rawRpc(msg)
      // Assert the REJECTION SHAPE, not merely "it threw": an error
      // envelope, the protocol-level `UNSUPPORTED` code, and a message that
      // names both the command and the missing engine feature.
      expect(resp.ok).toBe(false)
      if (resp.ok) throw new Error(`expected an error envelope for ${msg.cmd}`)
      expect(resp.error).toEqual({
        code: 'UNSUPPORTED',
        message: `${msg.cmd} (structural edits) is not implemented by the TS worker runtime`,
      })
    }
    // Fail-closed means fail-CLOSED: no partial band shift leaked through.
    const after = await tsEngine.readSamples([{ sheet: 0, addr: 'A5' }])
    expect(after.get('0:A5')).toEqual(before.get('0:A5'))
    // ...and the capability handshake agrees, so a compliant adapter never
    // sends these at all — the refusal is only the last line of defence.
    const caps = (await tsEngine.rpc({ cmd: 'describeCapabilities' })) as {
      structuralEdits: boolean
    }
    expect(caps.structuralEdits).toBe(false)
  })

  test(
    'P4 clearRange parity — full-column clear is sparse (closed-form counter) + identical post-state',
    async () => {
      // Sheet1 column A still holds exactly its seeded cell count: P2 only
      // OVERWROTE numbers there (never added/cleared A-column cells).
      const tsCleared = await tsEngine.clearColumn(0, 0)
      const wasmCleared = await wasmEngine.clearColumn(0, 0)
      expect(tsCleared).toBe(workload.sheet1ColACount)
      expect(wasmCleared).toBe(workload.sheet1ColACount)

      const tsSamples = await tsEngine.readSamples(workload.sampleRefs)
      const wasmSamples = await wasmEngine.readSamples(workload.sampleRefs)
      expectParity(tsSamples, wasmSamples, 'P4 clearRange parity')

      // Closed form after the clear: the whole-column SUM collapses to 0.
      expect(tsSamples.get('0:G1')?.display).toBe('0')
      expect(wasmSamples.get('0:G1')?.display).toBe('0')
    },
    30_000,
  )

  test(
    'P5 restore parity — snapshotPersistenceV1 → fresh runtime → restore on both engines',
    async () => {
      const tsBefore = await tsEngine.readSamples(workload.sampleRefs)
      const wasmBefore = await wasmEngine.readSamples(workload.sampleRefs)

      const tsSnapshot = await tsEngine.snapshotPersistence()
      const wasmSnapshot = await wasmEngine.snapshotPersistence()

      // Snapshot-shape parity (wire level): version + 表元数据**全等**。
      //
      // 这里以前是子集比对（只挑 `{ idx, name }`），理由是
      // `WorkbookPersistenceSheetWire` 当年还声明了可选的 `rowCount?` /
      // `colCount?`：WASM 引擎用 `sheet_sparse_bounds` 填，TS runtime 不填，
      // 两边都合法，于是 `toEqual` 断的是 wire 从没许诺过的事。
      //
      // 2026-08-01 那两个字段被**删掉了** —— 它们纯写不读（两边的 restore 都
      // 不碰），唯一的实际作用就是让两个引擎的快照永远无法逐字相等。字段没了，
      // 分歧的来源也就没了：wire 上现在只剩 `{ idx, name }`，没有留给「某一边
      // 填、另一边不填」的空位，所以直接整对象全等。
      //
      // 这条断言现在是有牙的：任何一边**再往表元数据上加字段**，只要另一边没
      // 跟上，这里就会红。那正是想要的信号 —— 不要再把它放宽回子集比对，去让
      // 两边的 wire 重新对齐。
      expect(wasmSnapshot.version).toBe(tsSnapshot.version)
      // `toStrictEqual` 而非 `toEqual`：后者会忽略值为 `undefined` 的属性，
      // 那正是本次要堵的洞 —— 一边显式写 `rowCount: undefined` 也算「相等」。
      expect(wasmSnapshot.sheets).toStrictEqual(tsSnapshot.sheets)
      // Cell-record parity keyed by sheet:addr → kind:value. Spill-region
      // addresses stay excluded for robustness, though both engines now
      // omit spill projections from snapshots: the TS runtime's
      // `snapshotRangeSparse` walks only real cells (anchor formula source
      // included), and the Rust engine's `sparse_cell_from_sheet_no_eval`
      // filters its projected targets out with `Sheet::is_spilled`.
      //
      // That filter is NEW, and this exclusion is why the test never caught
      // its absence. A Rust spill target IS a live cell in `Sheet::cells` —
      // a derived atom — so `for_each_non_empty` reported it and the
      // snapshot serialized it as a `kind:"number"` literal. On restore the
      // literals occupied the anchor's own region and it read back
      // `#SPILL!`. Nothing here saw it because `spillKeys` dropped exactly
      // those addresses; the roundtrip assertion below is what failed.
      // Restored DISPLAYS are asserted equal below.
      const spillKeys = new Set(workload.spillRegionRefs.map(refKey))
      const cellMap = (snapshot: PersistenceSnapshot) => {
        const out = new Map<string, string>()
        for (const cell of snapshot.cells) {
          const key = `${cell.sheet}:${cell.addr}`
          if (spillKeys.has(key)) continue
          out.set(key, `${cell.kind}:${JSON.stringify(cell.value ?? null)}`)
        }
        return out
      }
      expect(cellMap(wasmSnapshot)).toEqual(cellMap(tsSnapshot))

      // Per-engine roundtrip: fresh runtime + restore reproduces the
      // pre-snapshot samples exactly.
      const tsRestored = await tsEngine.restoreIntoFresh(tsSnapshot)
      const wasmRestored = await wasmEngine.restoreIntoFresh(wasmSnapshot)
      try {
        const tsAfter = await tsRestored.readSamples(workload.sampleRefs)
        const wasmAfter = await wasmRestored.readSamples(workload.sampleRefs)
        expectParity(tsAfter, tsBefore, 'P5 TS restore roundtrip (restored vs pre-snapshot)')
        expectParity(wasmAfter, wasmBefore, 'P5 WASM restore roundtrip (restored vs pre-snapshot)')
        // Cross-engine equality of the restored workbooks.
        expectParity(tsAfter, wasmAfter, 'P5 cross-engine restored state')
      } finally {
        wasmRestored.dispose()
      }
    },
    30_000,
  )
})
