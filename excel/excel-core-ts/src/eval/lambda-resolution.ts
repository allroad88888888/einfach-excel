/** Resolves expressions that may produce a LAMBDA without evaluating its body eagerly. */
import type { CallExpr, EvalContext, Expr, LambdaBinding, Value } from '../types'
import { canonicalName } from './canonical-name'
import { toBoolean } from './coerce'
import { ERR } from './error-value'
import { excelEquals } from './functions/logical'
import {
  bindLambdaSelf,
  makeLambdaBinding,
  prepareLambdaContext,
  type LambdaArgument,
  type LambdaResolveResult,
} from './lambda-apply'
import type { RuntimeRef } from './runtime-ref'
import { validateRuntimeRefSheet } from './runtime-ref'
import type { RuntimeRefResult, SelectedExprResult } from './runtime-ref-resolve'
import type { XLookupCoreResult } from './functions/lookup'

export interface LambdaResolutionDeps {
  readonly evaluate: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateLambdaArg: (expr: Expr, ctx: EvalContext) => LambdaArgument
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
  readonly chooseSelectedExpr: (args: ReadonlyArray<Expr>, ctx: EvalContext) => SelectedExprResult
  readonly selectFilterRows: (
    array: Expr,
    include: Expr,
    ctx: EvalContext,
  ) =>
    | { readonly ok: true; readonly rows: Value[][] }
    | { readonly ok: false; readonly error: Value }
  readonly evaluateXLookupMatch: (args: ReadonlyArray<Expr>, ctx: EvalContext) => XLookupCoreResult
}

export function resolveLambdaExpr(
  expr: Expr,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (expr.kind === 'call' && expr.name.toUpperCase() === 'LAMBDA') {
    return makeLambdaBinding(expr.args, ctx)
  }
  if (expr.kind === 'lambdaCall') return resolveLambdaCallResult(expr.callee, expr.args, ctx, deps)
  if (expr.kind === 'name') {
    const scoped = ctx.lambdaFunctionScope?.get(canonicalName(expr.name))
    if (scoped) return { lambda: scoped }
    const binding = ctx.resolveName(expr.name)
    return binding?.kind === 'lambda' ? { lambda: binding } : {}
  }
  return expr.kind === 'call' ? resolveLambdaReturningCall(expr, ctx, deps) : {}
}
function resolveLambdaCallResult(
  callee: Expr,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  const resolved = resolveLambdaExpr(callee, ctx, deps)
  if (resolved.error) return resolved
  if (!resolved.lambda) {
    const value = deps.evaluate(callee, ctx)
    return value.kind === 'error' ? { error: value } : {}
  }
  return resolveAppliedLambdaResult(resolved.lambda, args, ctx, deps)
}
function resolveLambdaReturningCall(
  call: CallExpr,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  switch (call.name.toUpperCase()) {
    case 'IF':
      return resolveIfResultAsLambda(call.args, ctx, deps)
    case 'IFERROR':
      return resolveIfErrorResultAsLambda(call.args, ctx, deps)
    case 'IFNA':
      return resolveIfNaResultAsLambda(call.args, ctx, deps)
    case 'IFS':
      return resolveIfsResultAsLambda(call.args, ctx, deps)
    case 'SWITCH':
      return resolveSwitchResultAsLambda(call.args, ctx, deps)
    case 'CHOOSE':
      return resolveChooseResultAsLambda(call.args, ctx, deps)
    case 'FILTER':
      return resolveFilterResultAsLambda(call.args, ctx, deps)
    case 'XLOOKUP':
      return resolveXLookupResultAsLambda(call.args, ctx, deps)
    case 'LET':
      return resolveLetResultAsLambda(call.args, ctx, deps)
  }
  const scoped = ctx.lambdaFunctionScope?.get(canonicalName(call.name))
  if (scoped) return resolveAppliedLambdaResult(scoped, call.args, ctx, deps)
  const binding = ctx.resolveName(call.name)
  return binding?.kind === 'lambda' ? resolveAppliedLambdaResult(binding, call.args, ctx, deps) : {}
}
function resolveIfResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length < 2 || args.length > 3)
    return { error: ERR('#VALUE!', 'IF expects 2 or 3 arguments') }
  const condition = deps.evaluate(args[0], ctx)
  if (condition.kind === 'error') return { error: condition }
  const coerced = toBoolean(condition)
  if (!coerced.ok) return { error: coerced.error }
  return coerced.value
    ? resolveLambdaOrValueError(args[1], ctx, deps)
    : args.length === 3
      ? resolveLambdaOrValueError(args[2], ctx, deps)
      : {}
}
function resolveIfErrorResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length !== 2) return { error: ERR('#VALUE!') }
  const lambda = resolveLambdaExpr(args[0], ctx, deps)
  if (lambda.lambda) return lambda
  if (lambda.error) return resolveLambdaOrValueError(args[1], ctx, deps)
  return deps.evaluateFunctionArg(args[0], ctx).kind === 'error'
    ? resolveLambdaOrValueError(args[1], ctx, deps)
    : {}
}

function resolveIfNaResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length !== 2) return { error: ERR('#VALUE!') }
  const lambda = resolveLambdaExpr(args[0], ctx, deps)
  if (lambda.lambda) return lambda
  if (lambda.error)
    return lambda.error.kind === 'error' && lambda.error.code === '#N/A'
      ? resolveLambdaOrValueError(args[1], ctx, deps)
      : lambda
  const value = deps.evaluateFunctionArg(args[0], ctx)
  return value.kind === 'error' && value.code === '#N/A'
    ? resolveLambdaOrValueError(args[1], ctx, deps)
    : {}
}

function resolveIfsResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length === 0) return { error: ERR('#VALUE!') }
  for (let index = 0; index < Math.floor(args.length / 2); index += 1) {
    const condition = deps.evaluateFunctionArg(args[index * 2], ctx)
    if (condition.kind === 'error') return { error: condition }
    const coerced = toBoolean(condition)
    if (!coerced.ok) return { error: coerced.error }
    if (coerced.value) return resolveLambdaOrValueError(args[index * 2 + 1], ctx, deps)
  }
  return { error: ERR('#N/A') }
}

function resolveSwitchResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length < 3) return { error: ERR('#VALUE!') }
  const expression = deps.evaluateFunctionArg(args[0], ctx)
  if (expression.kind === 'error') return { error: expression }
  const pairCount = Math.floor((args.length - 1) / 2)
  for (let index = 0; index < pairCount; index += 1) {
    const candidate = deps.evaluateFunctionArg(args[1 + index * 2], ctx)
    if (candidate.kind === 'error') return { error: candidate }
    if (excelEquals(expression, candidate))
      return resolveLambdaOrValueError(args[2 + index * 2], ctx, deps)
  }
  return (args.length - 1) % 2 === 1
    ? resolveLambdaOrValueError(args[args.length - 1], ctx, deps)
    : { error: ERR('#N/A') }
}

function resolveChooseResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  const selected = deps.chooseSelectedExpr(args, ctx)
  return selected.ok
    ? resolveLambdaOrValueError(selected.expr, ctx, deps)
    : { error: selected.error }
}

function resolveFilterResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length < 2 || args.length > 3) return { error: ERR('#VALUE!', 'FILTER needs 2-3 args') }
  const filtered = deps.selectFilterRows(args[0], args[1], ctx)
  if (!filtered.ok) return { error: filtered.error }
  if (filtered.rows.length > 0 && filtered.rows[0]?.length > 0) return {}
  return args.length === 3
    ? resolveLambdaOrValueError(args[2], ctx, deps)
    : { error: ERR('#CALC!', 'FILTER returned empty result') }
}

function resolveXLookupResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  const result = deps.evaluateXLookupMatch(args, ctx)
  if (result.kind === 'value') return {}
  if (result.kind === 'error') return { error: result.error }
  return args.length >= 4 ? resolveLambdaOrValueError(args[3], ctx, deps) : { error: ERR('#N/A') }
}

function resolveLetResultAsLambda(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  if (args.length < 3 || args.length % 2 === 0)
    return { error: ERR('#VALUE!', 'LET expects name/value pairs plus a result expression') }
  const values = new Map<string, Value>(ctx.lambdaScope ?? [])
  const refs = new Map<string, RuntimeRef>(ctx.lambdaRefScope ?? [])
  const functions = new Map<string, LambdaBinding>(ctx.lambdaFunctionScope ?? [])
  const omitted = ctx.lambdaOmittedParams ? new Set<string>(ctx.lambdaOmittedParams) : undefined
  const subCtx: EvalContext = {
    ...ctx,
    lambdaScope: values,
    lambdaRefScope: refs,
    lambdaFunctionScope: functions,
    lambdaOmittedParams: omitted,
  }
  for (let index = 0; index < args.length - 1; index += 2) {
    const nameExpr = args[index]
    if (nameExpr.kind !== 'name')
      return { error: ERR('#NAME?', 'LET binding name must be an identifier') }
    const name = canonicalName(nameExpr.name)
    const lambda = resolveLambdaExpr(args[index + 1], subCtx, deps)
    if (lambda.error) return lambda
    if (lambda.lambda) {
      functions.set(name, bindLambdaSelf(name, lambda.lambda))
      values.delete(name)
      refs.delete(name)
      omitted?.delete(name)
      continue
    }
    const reference = deps.resolveRef(args[index + 1], subCtx)
    if (reference.ok) {
      const sheetError = validateRuntimeRefSheet(reference.ref, subCtx)
      if (sheetError) return { error: sheetError }
      refs.set(name, reference.ref)
      values.delete(name)
      functions.delete(name)
      omitted?.delete(name)
      continue
    }
    if (reference.error) return { error: reference.error }
    const value = deps.evaluateFunctionArg(args[index + 1], subCtx)
    if (value.kind === 'error') return { error: value }
    values.set(name, value)
    refs.delete(name)
    functions.delete(name)
    omitted?.delete(name)
  }
  return resolveLambdaOrValueError(args[args.length - 1], subCtx, deps)
}

function resolveAppliedLambdaResult(
  lambda: LambdaBinding,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  const prepared = prepareLambdaContext(
    lambda,
    args.map((arg) => deps.evaluateLambdaArg(arg, ctx)),
    ctx,
  )
  if (!prepared.ok) return { error: prepared.error }
  prepared.depth.count += 1
  try {
    return resolveLambdaOrValueError(lambda.body, prepared.subCtx, deps)
  } finally {
    prepared.depth.count -= 1
  }
}

function resolveLambdaOrValueError(
  expr: Expr,
  ctx: EvalContext,
  deps: LambdaResolutionDeps,
): LambdaResolveResult {
  const resolved = resolveLambdaExpr(expr, ctx, deps)
  if (resolved.error || resolved.lambda) return resolved
  const value = deps.evaluate(expr, ctx)
  return value.kind === 'error' ? { error: value } : {}
}
