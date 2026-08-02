/**
 * 稀疏 SUBTOTAL / AGGREGATE：把 1..19 号聚合在「区域不物化」前提下流式重算一遍。
 *
 * 约定与事故留痕见 `sparse-aggregations.ts` 文件头：本文件里的函数是
 * `FUNCTIONS` 注册表里同名函数的第二实现，`evaluate` 会在派发到函数表之前把
 * 它们截走，改一边必须改另一边。与 `./evaluate` 的循环导入同样是有意的。
 */

import type { EvalContext, Expr, Value } from '../types'
import type { SubtotalErrorMode } from './functions/math'
import { toNumber } from './coerce'
import {
  ERR,
  canSparseIterate,
  evaluateFunctionArg,
  runtimeRefFromExpr,
  sparseValuesForRef,
} from './evaluate'

export function evaluateSparseSubtotal(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 2) return undefined
  const dataArgs = args.slice(1)
  if (!subtotalHasSparseRef(dataArgs, ctx)) return undefined

  const fnArg = evaluateFunctionArg(args[0], ctx)
  if (fnArg.kind === 'error') return fnArg
  const fnValue = toNumber(fnArg)
  if (!fnValue.ok) return fnValue.error
  const raw = Math.trunc(fnValue.value)
  const fnNum = raw >= 101 && raw <= 111 ? raw - 100 : raw
  if (fnNum < 1 || fnNum > 11) return ERR('#VALUE!')
  return runSparseSubtotalFunction(fnNum, dataArgs, ctx, false)
}

export function evaluateSparseAggregate(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  if (args.length < 3) return undefined
  if (!subtotalHasSparseRef(args.slice(2), ctx)) return undefined

  const fnArg = evaluateFunctionArg(args[0], ctx)
  if (fnArg.kind === 'error') return fnArg
  const fnValue = toNumber(fnArg)
  if (!fnValue.ok) return fnValue.error

  const optionArg = evaluateFunctionArg(args[1], ctx)
  if (optionArg.kind === 'error') return optionArg
  const optionValue = toNumber(optionArg)
  if (!optionValue.ok) return optionValue.error

  const fnNum = Math.trunc(fnValue.value)
  const options = Math.trunc(optionValue.value)
  if (fnNum < 1 || fnNum > 19 || options < 0 || options > 7) return ERR('#VALUE!')
  const ignoreErrors = (options & 2) !== 0

  if (fnNum >= 14) {
    if (args.length < 4) return ERR('#VALUE!')
    const dataArgs = args.slice(2, -1)
    if (!subtotalHasSparseRef(dataArgs, ctx)) return undefined
    const kArg = evaluateFunctionArg(args[args.length - 1], ctx)
    if (kArg.kind === 'error') return kArg
    const kValue = toNumber(kArg)
    if (!kValue.ok) return kValue.error
    return runSparseSubtotalFunction(fnNum, dataArgs, ctx, ignoreErrors, kValue.value)
  }

  const dataArgs = args.slice(2)
  if (!subtotalHasSparseRef(dataArgs, ctx)) return undefined
  return runSparseSubtotalFunction(fnNum, dataArgs, ctx, ignoreErrors)
}

function subtotalHasSparseRef(args: ReadonlyArray<Expr>, ctx: EvalContext): boolean {
  for (const arg of args) {
    const ref = runtimeRefFromExpr(arg, ctx)
    if (ref.ok && canSparseIterate(ref.ref)) return true
  }
  return false
}

function flattenSparseSubtotalValues(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  errors: SubtotalErrorMode,
): { readonly ok: true; readonly values: Value[] } | {
  readonly ok: false
  readonly error: Value
} {
  const values: Value[] = []

  const visit = (value: Value): (Value & { kind: 'error' }) | undefined => {
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) {
          const error = visit(cell)
          if (error) return error
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
    const ref = runtimeRefFromExpr(arg, ctx)
    if (ref.ok && canSparseIterate(ref.ref)) {
      const sparse = sparseValuesForRef(ref.ref, ctx)
      if (!sparse.ok) return { ok: false, error: sparse.error }
      for (const { value } of sparse.values) {
        const error = visit(value)
        if (error) return { ok: false, error }
      }
      continue
    }

    const error = visit(evaluateFunctionArg(arg, ctx))
    if (error) return { ok: false, error }
  }

  return { ok: true, values }
}

function runSparseSubtotalFunction(
  fnNum: number,
  dataArgs: ReadonlyArray<Expr>,
  ctx: EvalContext,
  ignoreErrors: boolean,
  k?: number,
): Value {
  // COUNT / COUNTA are error-transparent — see the same guard in
  // `runSubtotalFunction` (`functions/math.ts`), which this streaming twin
  // must answer identically or the sparse fast path becomes observable.
  if (fnNum === 2 || fnNum === 3) {
    const counted = flattenSparseSubtotalValues(
      dataArgs,
      ctx,
      fnNum === 2 || ignoreErrors ? 'drop' : 'keep',
    )
    if (!counted.ok) return counted.error
    return {
      kind: 'number',
      value:
        fnNum === 2
          ? counted.values.filter((value) => value.kind === 'number').length
          : counted.values.filter((value) => value.kind !== 'blank').length,
    }
  }

  const flat = flattenSparseSubtotalValues(dataArgs, ctx, ignoreErrors ? 'drop' : 'propagate')
  if (!flat.ok) return flat.error
  const nums = flat.values.flatMap((value) => (value.kind === 'number' ? [value.value] : []))

  switch (fnNum) {
    case 1:
      return nums.length === 0
        ? ERR('#DIV/0!')
        : { kind: 'number', value: nums.reduce((a, b) => a + b, 0) / nums.length }
    // 2 (COUNT) / 3 (COUNTA) returned above, before the propagating flatten.
    case 4:
      return {
        kind: 'number',
        value: nums.length === 0 ? 0 : nums.reduce((best, n) => Math.max(best, n), nums[0]),
      }
    case 5:
      return {
        kind: 'number',
        value: nums.length === 0 ? 0 : nums.reduce((best, n) => Math.min(best, n), nums[0]),
      }
    case 6:
      return {
        kind: 'number',
        value: nums.length === 0 ? 0 : nums.reduce((a, b) => a * b, 1),
      }
    case 7: {
      const variance = varianceFromSparseSubtotalNumbers(nums, true)
      return variance.kind === 'number'
        ? { kind: 'number', value: Math.sqrt(variance.value) }
        : variance
    }
    case 8: {
      const variance = varianceFromSparseSubtotalNumbers(nums, false)
      return variance.kind === 'number'
        ? { kind: 'number', value: Math.sqrt(variance.value) }
        : variance
    }
    case 9:
      return { kind: 'number', value: nums.reduce((a, b) => a + b, 0) }
    case 10:
      return varianceFromSparseSubtotalNumbers(nums, true)
    case 11:
      return varianceFromSparseSubtotalNumbers(nums, false)
    case 12: {
      if (nums.length === 0) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return {
        kind: 'number',
        value: sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2,
      }
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
      return bestCount <= 1 ? ERR('#VALUE!') : { kind: 'number', value: best }
    }
    case 14:
    case 15: {
      if (k === undefined || k < 1 || Math.trunc(k) !== k || k > nums.length) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => (fnNum === 14 ? b - a : a - b))
      return { kind: 'number', value: sorted[k - 1] }
    }
    case 16:
    case 18: {
      if (k === undefined) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      return fnNum === 16
        ? percentileInclusiveSparseSubtotal(sorted, k)
        : percentileExclusiveSparseSubtotal(sorted, k)
    }
    case 17:
    case 19: {
      if (k === undefined || Math.trunc(k) !== k) return ERR('#VALUE!')
      if (fnNum === 17 && (k < 0 || k > 4)) return ERR('#VALUE!')
      if (fnNum === 19 && (k < 1 || k > 3)) return ERR('#VALUE!')
      const sorted = nums.slice().sort((a, b) => a - b)
      return fnNum === 17
        ? percentileInclusiveSparseSubtotal(sorted, k / 4)
        : percentileExclusiveSparseSubtotal(sorted, k / 4)
    }
    default:
      return ERR('#VALUE!')
  }
}

function varianceFromSparseSubtotalNumbers(nums: ReadonlyArray<number>, sample: boolean): Value {
  const min = sample ? 2 : 1
  if (nums.length < min) return ERR('#DIV/0!')
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length
  const denom = sample ? nums.length - 1 : nums.length
  return {
    kind: 'number',
    value: nums.reduce((acc, n) => acc + (n - mean) ** 2, 0) / denom,
  }
}

function percentileInclusiveSparseSubtotal(sorted: ReadonlyArray<number>, k: number): Value {
  if (!Number.isFinite(k) || k < 0 || k > 1 || sorted.length === 0) return ERR('#VALUE!')
  const pos = k * (sorted.length - 1)
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  if (lo === hi) return { kind: 'number', value: sorted[lo] }
  return {
    kind: 'number',
    value: sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo),
  }
}

function percentileExclusiveSparseSubtotal(sorted: ReadonlyArray<number>, k: number): Value {
  if (!Number.isFinite(k) || k <= 0 || k >= 1 || sorted.length === 0) return ERR('#VALUE!')
  const pos = k * (sorted.length + 1)
  if (pos < 1 || pos > sorted.length) return ERR('#VALUE!')
  const zero = pos - 1
  const lo = Math.floor(zero)
  const hi = Math.ceil(zero)
  if (lo === hi) return { kind: 'number', value: sorted[lo] }
  return {
    kind: 'number',
    value: sorted[lo] + (sorted[hi] - sorted[lo]) * (zero - lo),
  }
}
