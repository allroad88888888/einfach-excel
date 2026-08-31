import type { RangeRef } from './types'
import type { Value } from './value'
import { isErr } from './value'
/**
 * SUBTOTAL(function_num, ref1, [ref2…]) — the TS mirror of the engine
 * `fn_subtotal` / `run_subtotal` (excel/rust/excel-core/src/eval.rs). This is what
 * makes an Excel Table totals row work on the static backend, because every
 * generated totals formula is `=SUBTOTAL(1xx, Table[Col])`.
 *
 * Function numbers: 1-11 aggregate every referenced cell; **101-111 share the
 * same accumulators but drop the host's hidden rows** (design-excel-table §6).
 * Anything else is `#VALUE!`, matching the engine's `InvalidValue`.
 *
 *   1/101 AVERAGE   2/102 COUNT (numbers)   3/103 COUNTA (non-empty)
 *   4/104 MAX       5/105 MIN               6/106 PRODUCT
 *   7/107 STDEV     8/108 STDEVP           9/109 SUM
 *  10/110 VAR      11/111 VARP
 *
 * Error propagation deliberately mirrors the engine arm-for-arm: the numeric
 * reducers (1/4/5/6/9) surface the first error they meet, while the counters
 * (2/3) and the deviation family (7/8/10/11) only pattern-match the value
 * kinds they care about and therefore ignore errors.
 *
 * TWO hidden-row inputs, never merged, mirroring the engine's
 * `eval_hidden_rows` / `eval_filter_hidden_rows` split
 * (`design-filter-hidden-rows` §6.2-§6.3):
 *
 *  - `hiddenRows` — MANUALLY hidden rows. Excluded by 101-111 only; 1-11
 *    deliberately INCLUDE them, which is Excel's rule and the reason a single
 *    merged set cannot express this function.
 *  - `filterHiddenRows` — rows removed by an ACTIVE FILTER. Excluded by BOTH
 *    bands. Until this input existed, `SUBTOTAL(1-11)` summed filtered-out
 *    rows and diverged from Excel; that was a bug, not a deferral.
 *
 * A row in both sets is skipped once (membership tests, not a union
 * allocation — same streaming shape as the engine's `for_each_subtotal_value`).
 * Both hosts are pinned to this matrix by the `filterHidden` phase of
 * vnext-table-totals-static-wasm-parity.
 */
function applySubtotal(
  args: Array<Value | RangeRef>,
  resolve: (row: number, col: number) => Value,
  isBlank: (row: number, col: number) => boolean,
  hiddenRows: ReadonlySet<number> | undefined,
  filterHiddenRows: ReadonlySet<number> | undefined,
): Value {
  // INTERNAL arity code, mirroring the engine's `ValueError::WrongArgCount`.
  // It never reaches a cell — `formatEvalResult` renders it `#VALUE!`, which
  // is what Excel's entry-time rejection leaves a user with. Keep it here: it
  // distinguishes "too few args" from a genuine `#VALUE!` when reading engine
  // state or a failing assertion.
  if (args.length < 2) return '#ARGS!'
  const rawFn = args[0]
  // `#TYPE!` is the INTERNAL argument-type-guard code (the engine's
  // `ValueError::WrongType`, which `fn_subtotal` raises for exactly this
  // check). It never reaches a cell: `formatEvalResult` renders it as
  // `#VALUE!`. Keep it here — it distinguishes "the function-number arg was
  // the wrong kind" from the `#VALUE!` an out-of-band code number gets.
  if (typeof rawFn === 'object') return '#TYPE!'
  if (isErr(rawFn)) return rawFn
  const asNumber = typeof rawFn === 'number' ? rawFn : Number(rawFn)
  if (!Number.isFinite(asNumber)) return '#TYPE!'
  const code = Math.trunc(asNumber)
  let mode: number
  // Both bands exclude FILTER-hidden rows; only 101-111 additionally exclude
  // MANUALLY hidden ones. Named for what it now decides, since the filter set
  // is no longer conditional on the band.
  let alsoIgnoreManualHidden: boolean
  if (code >= 1 && code <= 11) {
    mode = code
    alsoIgnoreManualHidden = false
  } else if (code >= 101 && code <= 111) {
    mode = code - 100
    alsoIgnoreManualHidden = true
  } else {
    return '#VALUE!'
  }

  // Stream every data argument once, skipping blanks (the engine's
  // `Value::Null`), filter-hidden rows, and — for 101-111 — manually hidden
  // rows as well.
  const walk = (visit: (v: Value) => void): void => {
    for (const arg of args.slice(1)) {
      if (typeof arg !== 'object') {
        visit(arg)
        continue
      }
      for (let row = arg.rowStart; row <= arg.rowEnd; row += 1) {
        if (filterHiddenRows?.has(row)) continue
        if (alsoIgnoreManualHidden && hiddenRows?.has(row)) continue
        for (let col = arg.colStart; col <= arg.colEnd; col += 1) {
          if (isBlank(row, col)) continue
          visit(resolve(row, col))
        }
      }
    }
  }

  // COUNTA counts every non-blank value (errors and text included).
  if (mode === 3) {
    let count = 0
    walk(() => {
      count += 1
    })
    return count
  }
  // COUNT counts numbers only and never propagates an error.
  if (mode === 2) {
    let count = 0
    walk((v) => {
      if (typeof v === 'number') count += 1
    })
    return count
  }
  // STDEV / STDEVP / VAR / VARP collect numbers and ignore everything else.
  if (mode === 7 || mode === 8 || mode === 10 || mode === 11) {
    const numbers: number[] = []
    walk((v) => {
      if (typeof v === 'number') numbers.push(v)
    })
    const isSample = mode === 7 || mode === 10
    if (numbers.length < (isSample ? 2 : 1)) return '#DIV/0!'
    const mean = numbers.reduce((a, b) => a + b, 0) / numbers.length
    const denom = isSample ? numbers.length - 1 : numbers.length
    const variance = numbers.reduce((acc, x) => acc + (x - mean) ** 2, 0) / denom
    return mode === 7 || mode === 8 ? Math.sqrt(variance) : variance
  }

  // AVERAGE / MAX / MIN / PRODUCT / SUM — first error wins.
  let error: string | null = null
  const numbers: number[] = []
  walk((v) => {
    if (error !== null) return
    if (isErr(v)) {
      error = v as string
      return
    }
    if (typeof v === 'number') numbers.push(v)
  })
  if (error !== null) return error
  switch (mode) {
    case 1:
      if (numbers.length === 0) return '#DIV/0!'
      return numbers.reduce((a, b) => a + b, 0) / numbers.length
    case 4:
      return numbers.length === 0 ? 0 : Math.max(...numbers)
    case 5:
      return numbers.length === 0 ? 0 : Math.min(...numbers)
    case 6:
      return numbers.length === 0 ? 0 : numbers.reduce((a, b) => a * b, 1)
    default:
      return numbers.reduce((a, b) => a + b, 0)
  }
}

export { applySubtotal }
