/** Sparse whole-axis paths for evaluator-aware array functions. */
import type { EvalContext, Expr, LambdaBinding, Value } from '../types'
import { arrayResult } from './array-shape'
import { applyBinary } from './binary-ops'
import { toBoolean, toNumber } from './coerce'
import { ERR } from './error-value'
import { applyLambdaForArrayCell } from './lambda-apply'
import { canSparseIterate, sameRuntimeRefRange, validateRuntimeRefSheet } from './runtime-ref'
import type { HigherOrderDeps } from './higher-order-deps'

export function evaluateMapSparse(
  expr: Expr,
  lambda: LambdaBinding,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value | undefined {
  const ref = deps.resolveRef(expr, ctx)
  if (!ref.ok || !canSparseIterate(ref.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(ref.ref, ctx)
  if (sheetError) return sheetError
  const sparse = deps.sparseValues(ref.ref, ctx)
  if (!sparse.ok) return sparse.error

  const out: Value[][] = []
  for (const { value } of sparse.values) {
    if (value.kind === 'blank') continue
    const result = applyLambdaForArrayCell(lambda, [value], ctx, deps.evaluate)
    if (!result.ok) return result.error
    out.push([result.value])
  }
  return out.length === 0 ? ERR('#CALC!', 'MAP produced no rows') : arrayResult(out, 'MAP result')
}

export function evaluateFilterSparse(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value | undefined {
  if (args.length < 2) return undefined
  const arrayRef = deps.resolveRef(args[0], ctx)
  if (!arrayRef.ok || !canSparseIterate(arrayRef.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(arrayRef.ref, ctx)
  if (sheetError) return sheetError

  const include = args[1]
  if (include.kind !== 'binary') return undefined
  const leftRef = deps.resolveRef(include.left, ctx)
  const rightRef = deps.resolveRef(include.right, ctx)
  const scalarExpr =
    leftRef.ok && sameRuntimeRefRange(leftRef.ref, arrayRef.ref)
      ? include.right
      : rightRef.ok && sameRuntimeRefRange(rightRef.ref, arrayRef.ref)
        ? include.left
        : undefined
  if (!scalarExpr) return undefined
  const scalar = deps.evaluate(scalarExpr, ctx)
  if (scalar.kind === 'error' || scalar.kind === 'array')
    return scalar.kind === 'array' ? undefined : scalar

  const sparse = deps.sparseValues(arrayRef.ref, ctx)
  if (!sparse.ok) return sparse.error
  const leftIsRef = leftRef.ok && sameRuntimeRefRange(leftRef.ref, arrayRef.ref)
  const out: Value[][] = []
  for (const { value } of sparse.values) {
    if (value.kind === 'blank') continue
    const comparison = leftIsRef
      ? applyBinary(include.op, value, scalar)
      : applyBinary(include.op, scalar, value)
    if (comparison.kind === 'error') return comparison
    const includeValue = toBoolean(comparison)
    if (!includeValue.ok) return includeValue.error
    if (includeValue.value) out.push([value])
  }
  if (out.length > 0) return arrayResult(out, 'FILTER result')
  return args.length === 3
    ? deps.evaluateFunctionArg(args[2], ctx)
    : ERR('#CALC!', 'FILTER returned empty result')
}

export function evaluateTocolSparse(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value | undefined {
  if (args.length < 1 || args.length > 3) return undefined
  const ref = deps.resolveRef(args[0], ctx)
  if (!ref.ok || !canSparseIterate(ref.ref)) return undefined
  const sheetError = validateRuntimeRefSheet(ref.ref, ctx)
  if (sheetError) return sheetError

  let ignoreMode = 0
  if (args.length >= 2) {
    const value = deps.evaluateFunctionArg(args[1], ctx)
    if (value.kind === 'error') return value
    const number = toNumber(value)
    if (!number.ok) return number.error
    ignoreMode = Math.trunc(number.value)
    if (ignoreMode < 0 || ignoreMode > 3) return ERR('#VALUE!')
  }

  const sparse = deps.sparseValues(ref.ref, ctx)
  if (!sparse.ok) return sparse.error
  const ignoreError = ignoreMode === 2 || ignoreMode === 3
  const values = sparse.values
    .map(({ value }) => value)
    .filter((value) => value.kind !== 'blank' && !(ignoreError && value.kind === 'error'))
  return values.length === 0
    ? ERR('#CALC!')
    : arrayResult(
        values.map((value) => [value]),
        'TOCOL result',
      )
}
