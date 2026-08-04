/** SUBTOTAL and AGGREGATE dispatch with range-aware error handling. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'
import { unaryNumber } from './trigonometry'

export type SubtotalErrorMode = 'propagate' | 'drop' | 'keep'

function flattenSubtotalValues(
  args: ReadonlyArray<Value>,
  errors: SubtotalErrorMode,
): { ok: true; values: Value[] } | { ok: false; error: Value & { kind: 'error' } } {
  const values: Value[] = []
  const visit = (value: Value): Value & { kind: 'error' } | undefined => {
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) {
          const err = visit(cell)
          if (err) return err
        }
      }
      return undefined
    }
    if (value.kind === 'error') {
      if (errors === 'propagate') return value
      if (errors === 'keep') values.push(value)
      return undefined
    }
    values.push(value)
    return undefined
  }
  for (const arg of args) {
    const err = visit(arg)
    if (err) return { ok: false, error: err }
  }
  return { ok: true, values }
}

function numericSubtotalValues(
  args: ReadonlyArray<Value>,
  ignoreErrors: boolean,
): { ok: true; nums: number[] } | { ok: false; error: Value & { kind: 'error' } } {
  const flat = flattenSubtotalValues(args, ignoreErrors ? 'drop' : 'propagate')
  if (!flat.ok) return flat
  return {
    ok: true,
    nums: flat.values.flatMap((value) => (value.kind === 'number' ? [value.value] : [])),
  }
}

function varianceFromNumbers(nums: number[], sample: boolean): Value {
  const min = sample ? 2 : 1
  if (nums.length < min) return ERR('#DIV/0!')
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const denom = sample ? nums.length - 1 : nums.length
  return NUM(nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / denom)
}

function percentileInclusive(sorted: number[], k: number): Value {
  if (!Number.isFinite(k) || k < 0 || k > 1 || sorted.length === 0) return ERR('#VALUE!')
  const pos = k * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return NUM(sorted[lo])
  return NUM(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo))
}

function percentileExclusive(sorted: number[], k: number): Value {
  if (!Number.isFinite(k) || k <= 0 || k >= 1 || sorted.length === 0) return ERR('#VALUE!')
  const pos = k * (sorted.length + 1)
  if (pos < 1 || pos > sorted.length) return ERR('#VALUE!')
  const zero = pos - 1
  const lo = Math.floor(zero)
  const hi = Math.ceil(zero)
  if (lo === hi) return NUM(sorted[lo])
  return NUM(sorted[lo] + (sorted[hi] - sorted[lo]) * (zero - lo))
}

function runSubtotalFunction(
  fnNum: number,
  dataArgs: ReadonlyArray<Value>,
  ignoreErrors: boolean,
  k?: number,
): Value {
  // COUNT (2) and COUNTA (3) are error-TRANSPARENT in Excel and must be
  // handled before the propagating flatten below: an error cell inside a
  // reference is simply "not a number" to COUNT and simply "not blank" to
  // COUNTA, so neither ever answers the error. `=SUBTOTAL(2, A1:B3)` over
  // {1,2,3,"txt",TRUE,#DIV/0!} is 3 and `=SUBTOTAL(3, ...)` is 6 — the Rust
  // engine has always answered that; this engine used to answer `#DIV/0!` for
  // both, which is the divergence pinned in
  // `solid-excel/test/cross-engine-parity-smoke.test.ts`.
  //
  // COUNT drops errors unconditionally (they are not numbers either way);
  // COUNTA keeps them unless AGGREGATE's ignore-errors bit is set, which is
  // what makes `=AGGREGATE(3, 6, ...)` one less than `=AGGREGATE(3, 0, ...)`.
  if (fnNum === 2 || fnNum === 3) {
    const counted = flattenSubtotalValues(
      dataArgs,
      fnNum === 2 || ignoreErrors ? 'drop' : 'keep',
    )
    if (!counted.ok) return counted.error
    return NUM(
      fnNum === 2
        ? counted.values.filter((value) => value.kind === 'number').length
        : counted.values.filter((value) => value.kind !== 'blank').length,
    )
  }

  const numsResult = numericSubtotalValues(dataArgs, ignoreErrors)
  if (!numsResult.ok) return numsResult.error
  const nums = numsResult.nums

  switch (fnNum) {
    case 1:
      if (nums.length === 0) return ERR('#DIV/0!')
      return NUM(nums.reduce((a, b) => a + b, 0) / nums.length)
    // 2 (COUNT) / 3 (COUNTA) returned above — they must not see the
    // error-propagating flatten.
    case 4:
      return nums.length === 0 ? NUM(0) : NUM(Math.max(...nums))
    case 5:
      return nums.length === 0 ? NUM(0) : NUM(Math.min(...nums))
    case 6:
      return nums.length === 0 ? NUM(0) : NUM(nums.reduce((a, b) => a * b, 1))
    case 7: {
      const v = varianceFromNumbers(nums, true)
      return v.kind === 'number' ? NUM(Math.sqrt(v.value)) : v
    }
    case 8: {
      const v = varianceFromNumbers(nums, false)
      return v.kind === 'number' ? NUM(Math.sqrt(v.value)) : v
    }
    case 9:
      return NUM(nums.reduce((a, b) => a + b, 0))
    case 10:
      return varianceFromNumbers(nums, true)
    case 11:
      return varianceFromNumbers(nums, false)
    case 12: {
      if (nums.length === 0) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 1 ? NUM(sorted[mid]) : NUM((sorted[mid - 1] + sorted[mid]) / 2)
    }
    case 13: {
      if (nums.length === 0) return ERR('#VALUE!')
      let best = nums[0]
      let bestCount = 0
      for (let i = 0; i < nums.length; i += 1) {
        let count = 0
        for (const n of nums) if (n === nums[i]) count += 1
        if (count > bestCount) {
          best = nums[i]
          bestCount = count
        }
      }
      return bestCount <= 1 ? ERR('#VALUE!') : NUM(best)
    }
    case 14:
    case 15: {
      if (k === undefined || k < 1 || Math.trunc(k) !== k || k > nums.length) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => (fnNum === 14 ? b - a : a - b))
      return NUM(sorted[k - 1])
    }
    case 16:
    case 18: {
      if (k === undefined) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      return fnNum === 16 ? percentileInclusive(sorted, k) : percentileExclusive(sorted, k)
    }
    case 17:
    case 19: {
      if (k === undefined || Math.trunc(k) !== k) return ERR('#VALUE!')
      if (fnNum === 17 && (k < 0 || k > 4)) return ERR('#VALUE!')
      if (fnNum === 19 && (k < 1 || k > 3)) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      const fraction = k / 4
      return fnNum === 17
        ? percentileInclusive(sorted, fraction)
        : percentileExclusive(sorted, fraction)
    }
    default:
      return ERR('#VALUE!')
  }
}

/** SUBTOTAL(function_num, ref1, ...) — ordinary range aggregation subset. */
export const SUBTOTAL: FunctionImpl = (args) => {
  // Only the FUNCTION-NUMBER argument short-circuits on an error; the data
  // args are the aggregation's own business and each function number decides
  // for itself (SUM propagates, COUNT/COUNTA do not). Propagating them here
  // made `=SUBTOTAL(2, B3, B3)` answer `#DIV/0!` where Excel and the Rust
  // engine answer 0. AGGREGATE next door already scopes this the same way
  // (`args.slice(0, 2)`), as does the sparse twin `evaluateSparseSubtotal`.
  const propagated = propagateError(args.slice(0, 1))
  if (propagated) return propagated
  if (args.length < 2) return ERR('#VALUE!')
  const fnValue = toNumber(args[0])
  if (!fnValue.ok) return fnValue.error
  const raw = Math.trunc(fnValue.value)
  const fnNum = raw >= 101 && raw <= 111 ? raw - 100 : raw
  if (fnNum < 1 || fnNum > 11) return ERR('#VALUE!')
  return runSubtotalFunction(fnNum, args.slice(1), false)
}

/** AGGREGATE(function_num, options, ref1, [ref2...], [k]). */
export const AGGREGATE: FunctionImpl = (args) => {
  const propagated = propagateError(args.slice(0, 2))
  if (propagated) return propagated
  if (args.length < 3) return ERR('#VALUE!')
  const fnValue = toNumber(args[0])
  if (!fnValue.ok) return fnValue.error
  const optionValue = toNumber(args[1])
  if (!optionValue.ok) return optionValue.error
  const fnNum = Math.trunc(fnValue.value)
  const options = Math.trunc(optionValue.value)
  if (fnNum < 1 || fnNum > 19 || options < 0 || options > 7) return ERR('#VALUE!')
  const ignoreErrors = (options & 2) !== 0
  if (fnNum >= 14) {
    if (args.length < 4) return ERR('#VALUE!')
    const kValue = toNumber(args[args.length - 1])
    if (!kValue.ok) return kValue.error
    return runSubtotalFunction(fnNum, args.slice(2, -1), ignoreErrors, kValue.value)
  }
  return runSubtotalFunction(fnNum, args.slice(2), ignoreErrors)
}

/** SQRTPI(n) — sqrt(n * π). */
export const SQRTPI: FunctionImpl = (args) => unaryNumber(args, (n) => {
  if (n < 0) return Number.NaN
  return Math.sqrt(n * Math.PI)
})


export const FUNCTIONS: Record<string, FunctionImpl> = { SUBTOTAL, AGGREGATE, SQRTPI }
