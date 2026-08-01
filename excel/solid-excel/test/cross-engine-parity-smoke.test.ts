/**
 * ALWAYS-ON cross-engine parity smoke — TS engine vs WASM engine.
 *
 * Companion to `scale-parity.test.ts`, which drives a seeded ~75k workload.
 * That file **used to be** gated behind `EINFACH_SCALE=1`, which meant every
 * divergence it can see was invisible to a plain `npx jest`, and two real
 * bugs sat in it unnoticed:
 *
 *   1. the WASM `bulk_install_workbook` path installed no spill projection,
 *      so an IMPORTED workbook showed only the top-left cell of every
 *      dynamic array;
 *   2. `=1+"x"` answered a non-Excel `#TYPE!` instead of `#VALUE!`.
 *
 * A third class joined them: the ERROR-CODE VOCABULARY. Both engines keep an
 * internal diagnostic code set that is wider than Excel's and narrow it at
 * the rendering boundary; when only one engine did the narrowing, the same
 * formula read `#TYPE!` on TS and `#VALUE!` on WASM. Single-engine suites
 * cannot see that — theirs was the vocabulary being asserted — so the pin
 * belongs here. See `ERROR_LITERALS` below.
 *
 * 那道门 2026-08-01 已经拆掉（理由见 `scale-parity.test.ts` 的文件头：门控依据的
 * 「~4.5 min」实测过期了约 57 倍，现场只要 4.7 s）。两份现在都是 always-on，
 * 分工不再是「跑不跑」而是**形状**：本份是每个分歧类的**最小形状** —— 一张表、
 * 无播种工作负载、不走 bulk 导入，失败时地址少到可以直接读；那份是播种规模，
 * 负责撞出最小形状撞不出的组合态。
 *
 * 本份必须快到能挂在每一次 `npx jest` 上（预算：远低于 60s；今天实测 ~1s），
 * 所以**不要**把它长成第二个 scale 套件。只有当一条分歧是**单引擎单测看不见的
 * 一整类**时，才往这里加场景。
 *
 * A fourth class is SPILL-REGION WRITE SEMANTICS. Typing into a non-anchor
 * projection cell was a known, owned divergence — the Rust engine refused the
 * write while the TS reference engine (and Excel) let it land and flipped the
 * anchor to `#SPILL!` — and it is what made the gated suite's P2/P4/P5 red at
 * 22 cells each. `docs/decisions/0006-spill-region-write-semantics.md` settled
 * it in Excel's favour and its phases 1/2 shipped, so the scenario is pinned
 * here now instead of being fenced off. Two engines are required: the whole
 * failure was one engine answering differently from the other on the same
 * keystroke.
 *
 * A fifth class is ARITHMETIC OPERAND COERCION — what an operator does with a
 * value that is not already a number. It is the class the `=1+"x"` row above
 * only half covered: that row pins the FAILURE code, and a suite that only
 * ever asks about non-coercible text cannot see an engine that coerces
 * nothing. `=1+"5"` is `6` in Excel and on the TS reference engine, and was
 * `#VALUE!` on the Rust engine for as long as this file existed — the gap
 * survived precisely because the only text this file ever fed an operator was
 * `"x"`. The scenarios below feed it text that IS a number, plus the two other
 * operators that share the coercion (unary minus, postfix `%`).
 *
 * A failure here is a REAL cross-engine finding: report the divergent
 * addresses, do not relax the assertion.
 */
import { afterAll, beforeAll, describe, expect, test } from '@jest/globals'

import {
  a1,
  displaysOf,
  flatten,
  loadWasmModule,
  makeEngine,
  type Engine,
  type EngineLabel,
  type WorkloadCell,
} from './cross-engine-parity-engines'

/** Row-major address list of a rectangle anchored at (row0, col0). */
function region(row0: number, col0: number, rows: number, cols: number): string[] {
  const out: string[] = []
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) out.push(a1(row0 + r, col0 + c))
  }
  return out
}

/**
 * Every error literal the formula parsers accept, paired with the token a
 * cell must SHOW for it. The two columns differ on exactly one row.
 *
 * `#TYPE!` and `#ARGS!` have no Excel counterpart: both engines keep them as
 * internal diagnostic codes (the argument-type / arity guards raise them, the
 * custom-formula return map accepts them, formula text and persistence
 * records carry them) and both collapse them to `#VALUE!` at the rendering
 * boundary — `format::error_display_token` in Rust, `errorDisplayToken` in
 * TS. `#TYPE!` is the row that caught a real divergence: only the TS side had
 * missed that collapse.
 *
 * `#CYCLE!` is non-Excel too and is DELIBERATELY displayed as-is on both
 * engines — Excel's answer (`0` + a status-bar warning) hides a real bug
 * inside a plausible number. That row pins a decision, not a pending item;
 * see the registry on `format::error_display_token` before "fixing" it.
 *
 * Changing any row here is a two-engine change: update Rust and TS in the
 * same commit or this table goes red.
 */
const ERROR_LITERALS: ReadonlyArray<readonly [literal: string, displayed: string]> = [
  ['#NULL!', '#NULL!'],
  ['#DIV/0!', '#DIV/0!'],
  ['#N/A', '#N/A'],
  ['#REF!', '#REF!'],
  ['#VALUE!', '#VALUE!'],
  ['#NAME?', '#NAME?'],
  ['#NUM!', '#NUM!'],
  ['#CYCLE!', '#CYCLE!'],
  ['#TYPE!', '#VALUE!'],
  ['#ARGS!', '#VALUE!'],
  ['#SPILL!', '#SPILL!'],
  ['#CALC!', '#CALC!'],
  ['#BUSY!', '#BUSY!'],
]

/** `=#REF!` in column P, `=#REF!+1` in column Q — one row per literal. */
const LITERAL_ADDRS = ERROR_LITERALS.map((_, i) => a1(i, 15))
const PROPAGATED_ADDRS = ERROR_LITERALS.map((_, i) => a1(i, 16))
const EXPECTED_LITERAL_DISPLAYS = ERROR_LITERALS.map(([, displayed]) => displayed)

/**
 * Column R — arithmetic operand coercion, one formula per row paired with the
 * display BOTH engines must show. Excel's answers; the TS reference engine
 * (`excel-core-ts/src/eval/coerce.ts` `toNumber` + `evaluate.ts` unary /
 * percent arms) agrees on every row.
 *
 * Rows 1-4 are the numeric-string rule: an operand that is text but LOOKS
 * numeric coerces. Row 5 is the same rule under unary minus. Rows 6-8 are the
 * postfix `%` operator, whose binding is what makes `=-50%` `-0.5` rather than
 * a parse error, and which is NOT modulo — Excel has no modulo operator.
 *
 * NOT pinned here, deliberately: `=2^2%`. Excel parses it `2^(2%)` = 2^0.02
 * because `%` binds tighter than `^`; the TS parser's `POSTFIX_BP` (55) sits
 * BELOW `^`'s left-bp (60) and its infix loop never re-enters the postfix
 * loop, so the `%` is left unconsumed and the whole formula becomes a parse
 * error. That is a single-engine TS defect, not a shape this file can assert
 * agreement on — pinning it would just encode the defect.
 */
const COERCION_CASES: ReadonlyArray<readonly [formula: string, displayed: string]> = [
  ['=1+"5"', '6'],
  ['="5"*"3"', '15'],
  ['="10"-4', '6'],
  ['=" -5 "+0', '-5'], // surrounding whitespace is trimmed before parsing
  ['=-"5"', '-5'],
  ['=50%', '0.5'],
  ['=-50%', '-0.5'],
  ['=50%%', '0.005'], // stacking is legal in Excel
]
const COERCION_ADDRS = COERCION_CASES.map((_, i) => a1(i, 17))
const EXPECTED_COERCION_DISPLAYS = COERCION_CASES.map(([, displayed]) => displayed)

const WORKLOAD: WorkloadCell[] = [
  { row: 0, col: 0, kind: 'number', value: 5 }, // A1 — a plain literal
  { row: 0, col: 7, kind: 'formula', value: '=SEQUENCE(10)' }, // H1 → H1:H10
  { row: 0, col: 9, kind: 'formula', value: '=SEQUENCE(4,3)' }, // J1 → J1:L4
  { row: 0, col: 12, kind: 'formula', value: '=1+"x"' }, // M1
  { row: 1, col: 12, kind: 'formula', value: '="x"+"y"' }, // M2
  { row: 2, col: 12, kind: 'formula', value: '=-"abc"' }, // M3
  { row: 0, col: 13, kind: 'formula', value: '=SUBTOTAL("x",A1:A3)' }, // N1
  // R1:R8 — arithmetic operand coercion, see COERCION_CASES.
  ...COERCION_CASES.map(
    ([formula], row): WorkloadCell => ({ row, col: 17, kind: 'formula', value: formula }),
  ),
  // P1:P13 / Q1:Q13 — one error literal per row, bare then propagated
  // through arithmetic (a token that renders right bare can still leak its
  // internal spelling once an operator short-circuits on it).
  ...ERROR_LITERALS.flatMap(([literal], row): WorkloadCell[] => [
    { row, col: 15, kind: 'formula', value: `=${literal}` },
    { row, col: 16, kind: 'formula', value: `=${literal}+1` },
  ]),
]

const SPILL_1D = region(0, 7, 10, 1) // H1:H10
const SPILL_2D = region(0, 9, 4, 3) // J1:L4
const ERROR_ADDRS = ['M1', 'M2', 'M3']
/** Everything the parity comparisons sample, incl. blanks past each spill. */
const PROBE_ADDRS = [
  'A1',
  ...SPILL_1D,
  'H11',
  ...SPILL_2D,
  'M9',
  ...ERROR_ADDRS,
  'N1',
  ...LITERAL_ADDRS,
  ...PROPAGATED_ADDRS,
  ...COERCION_ADDRS,
]

const SEQ_10 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']
const SEQ_4X3 = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']
// `=SEQUENCE(3,1,100,1)` / `=SEQUENCE(2,2,50,1)` re-pointed onto the anchors.
const SHRUNK_1D = ['100', '101', '102', '', '', '', '', '', '', '']
const SHRUNK_2D = ['50', '51', '', '52', '53', '', '', '', '', '', '', '']
// A blocker at H3 withdraws the whole array: anchor `#SPILL!`, ghosts blank,
// the typed value kept verbatim.
const BLOCKED_1D = ['#SPILL!', '', 'blocker', '', '', '', '', '', '', '']

describe('cross-engine parity smoke — TS runtime vs WASM engine', () => {
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

  test('arithmetic type errors agree: =1+"x" / ="x"+"y" / =-"abc" are all #VALUE!', async () => {
    const tsRead = await ts.read(ERROR_ADDRS)
    const wasmRead = await wasm.read(ERROR_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Excel's code for a non-coercible operand is #VALUE!. The regression
    // this pins answered `#TYPE!` on one engine — identical-and-wrong is
    // still wrong, hence the literal expectation on BOTH readings.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, ERROR_ADDRS)).toEqual(['#VALUE!', '#VALUE!', '#VALUE!'])
      for (const addr of ERROR_ADDRS) expect(read.get(addr)?.isError).toBe(true)
    }
  })

  test('numeric-string / unary-minus / percent coerce identically on both engines', async () => {
    const tsRead = await ts.read(COERCION_ADDRS)
    const wasmRead = await wasm.read(COERCION_ADDRS)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings: two engines that both answer `#VALUE!`
    // to `=1+"5"` agree perfectly and are both wrong, which is exactly the
    // state this scenario was added to end.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, COERCION_ADDRS)).toEqual(EXPECTED_COERCION_DISPLAYS)
      for (const addr of COERCION_ADDRS) expect(read.get(addr)?.isError).toBe(false)
    }
  })

  test('every error literal renders the same token on both engines', async () => {
    const addrs = [...LITERAL_ADDRS, ...PROPAGATED_ADDRS]
    const tsRead = await ts.read(addrs)
    const wasmRead = await wasm.read(addrs)
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))

    // Closed form on BOTH readings, not just cross-engine equality: the
    // divergence this pins had the TS engine showing `#TYPE!` where the Rust
    // engine showed `#VALUE!`, and "consistently wrong" would sail past an
    // equality-only assertion the day someone re-widened both sides.
    for (const read of [tsRead, wasmRead]) {
      expect(displaysOf(read, LITERAL_ADDRS)).toEqual(EXPECTED_LITERAL_DISPLAYS)
      // An operator short-circuiting on an errored operand must hand back the
      // same DISPLAYED token, not the internal one it was carrying.
      expect(displaysOf(read, PROPAGATED_ADDRS)).toEqual(EXPECTED_LITERAL_DISPLAYS)
      for (const addr of addrs) expect(read.get(addr)?.isError).toBe(true)
    }
  })

  test('argument-type guards render #VALUE!, never the internal #TYPE!', async () => {
    // SUBTOTAL's function-number check is the guard both engines implement
    // with the internal wrong-type code (`fn_subtotal` → `ValueError::
    // WrongType`; `applySubtotal` → `'#TYPE!'`). It reaches a cell only
    // through the rendering boundary, so it must read `#VALUE!`.
    const tsRead = await ts.read(['N1'])
    const wasmRead = await wasm.read(['N1'])
    expect(flatten(wasmRead)).toEqual(flatten(tsRead))
    for (const read of [tsRead, wasmRead]) {
      expect(read.get('N1')?.display).toBe('#VALUE!')
      expect(read.get('N1')?.isError).toBe(true)
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
