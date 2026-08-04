/** Core aggregate functions and their Excel coercion walk. */

import type { FunctionImpl, Value } from '../../../types'
import { toNumber } from '../../coerce'
import { finiteOrNum } from '../../overflow'
import { ERR, NUM } from './shared'

// ---------------------------------------------------------------------------

/**
 * Result of walking an aggregation argument list. Either an error
 * (propagated verbatim) or the visitor finished cleanly.
 */
type WalkResult = { ok: true } | { ok: false; error: Value & { kind: 'error' } }

/**
 * Iterate every numeric value reachable from `args`, applying Excel's
 * scalar-vs-array coercion rules:
 *  - scalar arg: blanks are ignored; every other value must coerce to a
 *    number via `toNumber`, or returns the coerce error.
 *  - array arg: walk every cell; numbers count, strings/booleans/blanks
 *    are skipped; errors propagate.
 *
 * `visit` is called for each emitted numeric. Returning early on the
 * first error mirrors Excel's "first error wins" rule.
 */
export function forEachNumericArg(
  args: ReadonlyArray<Value>,
  visit: (n: number) => void,
): WalkResult {
  for (const arg of args) {
    if (arg.kind === 'error') return { ok: false, error: arg }
    if (arg.kind === 'array') {
      const walk = forEachNumericInArray(arg.value, visit)
      if (!walk.ok) return walk
      continue
    }
    // An omitted slot and a reference to an empty cell both evaluate to
    // BLANK. Excel skips either one for numeric aggregates; treating the
    // latter as zero would make e.g. AVERAGE(1,Z99,3) count a phantom term.
    if (arg.kind === 'blank') continue
    // Scalar argument — coerce strictly.
    const n = toNumber(arg)
    if (!n.ok) return { ok: false, error: n.error }
    visit(n.value)
  }
  return { ok: true }
}

function forEachNumericInArray(
  rows: ReadonlyArray<ReadonlyArray<Value>>,
  visit: (n: number) => void,
): WalkResult {
  for (const row of rows) {
    for (const cell of row) {
      if (cell.kind === 'error') return { ok: false, error: cell }
      if (cell.kind === 'number') {
        visit(cell.value)
        continue
      }
      if (cell.kind === 'array') {
        // Nested arrays are flattened recursively (rare — only happens
        // when a function returns an array which is then fed into
        // another aggregator).
        const inner = forEachNumericInArray(cell.value, visit)
        if (!inner.ok) return inner
        continue
      }
      // string / boolean / blank inside an array/range → ignored.
    }
  }
  return { ok: true }
}

/**
 * COUNT-style iterator: only `number` cells count, regardless of
 * whether they came from a scalar arg or an array. Strings (even
 * numeric-looking ones), booleans, blanks are all skipped.
 *
 * Errors are split by SHAPE, which is the only signal available here:
 *
 *  - inside an array/range → SKIPPED, exactly like a string or a boolean.
 *    An error cell is not a number, so COUNT has no opinion about it and
 *    never hands it back. Same rule the SUBTOTAL/AGGREGATE counting codes
 *    run on (`SubtotalErrorMode` = `'drop'` below), and the same split the
 *    third implementation already made (`static-formula-eval.ts`
 *    `aggregateNumeric`: `if (name === 'COUNT') continue`).
 *  - a scalar arg → propagates, via the caller's `propagateError`. A bare
 *    error `Value` is what BOTH a literal `=COUNT(#REF!)` and a single-cell
 *    reference to an error cell look like by the time they reach a
 *    `FunctionImpl`, so this boundary cannot tell them apart; the scalar arm
 *    below is kept only as a guard for callers that skip `propagateError`.
 */
/**
 * COUNT: count numbers, skip everything else — **including errors, and
 * including an error written directly into the argument list**.
 *
 * 这里刻意不做错误传播，两条依据：
 *
 * 1. MS 文档 COUNT 的 Remarks: "Arguments that are error values or text
 *    that cannot be translated into numbers are not counted." 那句讲的正是
 *    直接写进参数表的实参，不只是区域里的格子。
 * 2. Rust 引擎（`excel/rust/excel-core/src/eval.rs` 的 `"COUNT"` 臂）只数
 *    `Value::Number`，全程没有任何短路 —— `=COUNT(#REF!)` 在那边是 0。
 *
 * 这个函数曾经在这里 propagate，注释还写着 "matches Excel"。那是错的，并且
 * 是一条活的跨引擎分歧：同一个 `=COUNT(#REF!)` 在 TS 上是 `#REF!`、在 WASM 上
 * 是 0。别把它加回来。
 */
function forEachCountNumber(args: ReadonlyArray<Value>, visit: () => void): void {
  for (const arg of args) {
    if (arg.kind === 'array') {
      for (const row of arg.value) {
        for (const cell of row) {
          if (cell.kind === 'number') visit()
          // error / string / boolean / blank inside an array → not a number.
        }
      }
      continue
    }
    if (arg.kind === 'number') visit()
    // error / string / boolean / blank scalar → skipped by COUNT.
  }
}

/**
 * COUNTA: count every non-blank — **errors included**, in arrays and as
 * direct arguments alike. An error is emphatically not blank; Rust's
 * `"COUNTA"` arm says the same thing in one line
 * (`if !matches!(v, Value::Null)`).
 */
function forEachCountANonBlank(
  args: ReadonlyArray<Value>,
  visit: () => void,
): void {
  for (const arg of args) {
    if (arg.kind === 'array') {
      for (const row of arg.value) {
        for (const cell of row) {
          if (cell.kind !== 'blank') visit()
        }
      }
      continue
    }
    if (arg.kind !== 'blank') visit()
  }
}

// ---------------------------------------------------------------------------
// Function implementations
// ---------------------------------------------------------------------------

export const SUM: FunctionImpl = (args) => {
  let total = 0
  const walk = forEachNumericArg(args, (n) => {
    total += n
  })
  if (!walk.ok) return walk.error
  // 累加器会溢出（两个 1E308 相加）。出口共用 `finiteOrNum`，且**稀疏孪生
  // `evaluateSparseSum` 必须同改** —— 真实公式路径跑的是那一份。
  return finiteOrNum(total)
}

export const AVERAGE: FunctionImpl = (args) => {
  let total = 0
  let count = 0
  const walk = forEachNumericArg(args, (n) => {
    total += n
    count += 1
  })
  if (!walk.ok) return walk.error
  if (count === 0) return ERR('#DIV/0!')
  return NUM(total / count)
}

export const COUNT: FunctionImpl = (args) => {
  let count = 0
  forEachCountNumber(args, () => {
    count += 1
  })
  return NUM(count)
}

export const COUNTA: FunctionImpl = (args) => {
  let count = 0
  forEachCountANonBlank(args, () => {
    count += 1
  })
  return NUM(count)
}

export const MIN: FunctionImpl = (args) => {
  let best = Number.POSITIVE_INFINITY
  let seen = false
  const walk = forEachNumericArg(args, (n) => {
    if (n < best) best = n
    seen = true
  })
  if (!walk.ok) return walk.error
  // Excel quirk: MIN() with no numeric values returns 0, not an error.
  if (!seen) return NUM(0)
  return NUM(best)
}

export const MAX: FunctionImpl = (args) => {
  let best = Number.NEGATIVE_INFINITY
  let seen = false
  const walk = forEachNumericArg(args, (n) => {
    if (n > best) best = n
    seen = true
  })
  if (!walk.ok) return walk.error
  if (!seen) return NUM(0)
  return NUM(best)
}

export const FUNCTIONS: Record<string, FunctionImpl> = { SUM, AVERAGE, COUNT, COUNTA, MIN, MAX }
