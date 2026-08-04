/** Lazy logical selectors and LET scope evaluation. */
import type { EvalContext, Expr, LambdaBinding, Value } from '../types'
import {
  evaluateArrayIf,
  evaluateArrayIfError,
  evaluateArrayIfs,
  evaluateArraySwitch,
} from './array-selectors'
import { toBoolean } from './coerce'
import { canonicalName } from './canonical-name'
import { ERR } from './error-value'
import { bindLambdaSelf, type LambdaResolveResult } from './lambda-apply'
import type { RuntimeRef } from './runtime-ref'
import type { RuntimeRefResult } from './runtime-ref-resolve'
import { validateRuntimeRefSheet } from './runtime-ref'

export interface ControlFlowDeps {
  readonly evaluate: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly resolveLambda: (expr: Expr, ctx: EvalContext) => LambdaResolveResult
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
}

export function evaluateIf(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
): Value {
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!', 'IF expects 2 or 3 arguments')
  const condition = deps.evaluateFunctionArg(args[0], ctx)
  if (condition.kind === 'error') return condition
  if (condition.kind === 'array')
    return evaluateArrayIf(condition, args, ctx, deps.evaluateFunctionArg)
  const coerced = toBoolean(condition)
  if (!coerced.ok) return coerced.error
  return coerced.value
    ? deps.evaluateFunctionArg(args[1], ctx)
    : args.length === 3
      ? deps.evaluateFunctionArg(args[2], ctx)
      : { kind: 'boolean', value: false }
}

export function evaluateIfError(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
): Value {
  if (args.length !== 2) return ERR('#VALUE!')
  const value = deps.evaluateFunctionArg(args[0], ctx)
  if (value.kind === 'array') {
    return evaluateArrayIfError(value, args[1], ctx, () => true, deps.evaluateFunctionArg)
  }
  return value.kind === 'error' ? deps.evaluateFunctionArg(args[1], ctx) : value
}

export function evaluateIfNa(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
): Value {
  if (args.length !== 2) return ERR('#VALUE!')
  const value = deps.evaluateFunctionArg(args[0], ctx)
  if (value.kind === 'array') {
    return evaluateArrayIfError(
      value,
      args[1],
      ctx,
      (error) => error.code === '#N/A',
      deps.evaluateFunctionArg,
    )
  }
  return value.kind === 'error' && value.code === '#N/A'
    ? deps.evaluateFunctionArg(args[1], ctx)
    : value
}

export function evaluateIfs(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
): Value {
  if (args.length === 0 || args.length % 2 !== 0) return ERR('#VALUE!')
  for (let index = 0; index < args.length / 2; index += 1) {
    const condition = deps.evaluateFunctionArg(args[index * 2], ctx)
    if (condition.kind === 'error') return condition
    if (condition.kind === 'array') {
      return evaluateArrayIfs(args, ctx, index, condition, deps.evaluateFunctionArg)
    }
    const coerced = toBoolean(condition)
    if (!coerced.ok) return coerced.error
    if (coerced.value) return deps.evaluateFunctionArg(args[index * 2 + 1], ctx)
  }
  return ERR('#N/A')
}

export function evaluateSwitch(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
  equals: (left: Value, right: Value) => boolean,
): Value {
  if (args.length < 3) return ERR('#VALUE!')
  const expression = deps.evaluateFunctionArg(args[0], ctx)
  if (expression.kind === 'error') return expression
  if (expression.kind === 'array')
    return evaluateArraySwitch(expression, args, ctx, deps.evaluateFunctionArg)
  const pairCount = Math.floor((args.length - 1) / 2)
  const hasDefault = (args.length - 1) % 2 === 1
  for (let index = 0; index < pairCount; index += 1) {
    const candidate = deps.evaluateFunctionArg(args[1 + index * 2], ctx)
    if (candidate.kind === 'error') return candidate
    if (equals(expression, candidate)) return deps.evaluateFunctionArg(args[2 + index * 2], ctx)
  }
  return hasDefault ? deps.evaluateFunctionArg(args[args.length - 1], ctx) : ERR('#N/A')
}

export function evaluateLet(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ControlFlowDeps,
): Value {
  if (args.length < 3 || args.length % 2 === 0) {
    return ERR('#VALUE!', 'LET expects name/value pairs plus a result expression')
  }
  const valueScope = new Map<string, Value>(ctx.lambdaScope ?? [])
  const refScope = new Map<string, RuntimeRef>(ctx.lambdaRefScope ?? [])
  const functionScope = new Map<string, LambdaBinding>(ctx.lambdaFunctionScope ?? [])
  const omitted = ctx.lambdaOmittedParams ? new Set<string>(ctx.lambdaOmittedParams) : undefined
  const subCtx: EvalContext = {
    ...ctx,
    lambdaScope: valueScope,
    lambdaRefScope: refScope,
    lambdaFunctionScope: functionScope,
    lambdaOmittedParams: omitted,
  }

  for (let index = 0; index < args.length - 1; index += 2) {
    const nameExpr = args[index]
    if (nameExpr.kind !== 'name') return ERR('#NAME?', 'LET binding name must be an identifier')
    const name = canonicalName(nameExpr.name)
    const lambda = deps.resolveLambda(args[index + 1], subCtx)
    if (lambda.error) return lambda.error
    if (lambda.lambda) {
      functionScope.set(name, bindLambdaSelf(name, lambda.lambda))
      valueScope.delete(name)
      refScope.delete(name)
      omitted?.delete(name)
      continue
    }
    const reference = deps.resolveRef(args[index + 1], subCtx)
    if (reference.ok) {
      const sheetError = validateRuntimeRefSheet(reference.ref, subCtx)
      if (sheetError) return sheetError
      refScope.set(name, reference.ref)
      valueScope.delete(name)
      functionScope.delete(name)
      omitted?.delete(name)
      continue
    }
    if (reference.error) return reference.error
    const value = deps.evaluate(args[index + 1], subCtx)
    if (value.kind === 'error') return value
    valueScope.set(name, value)
    refScope.delete(name)
    functionScope.delete(name)
    omitted?.delete(name)
  }
  return deps.evaluate(args[args.length - 1], subCtx)
}

export function evaluateIsOmitted(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  evaluate: (expr: Expr, context: EvalContext) => Value,
): Value {
  if (args.length !== 1) return ERR('#VALUE!', 'ISOMITTED expects 1 argument')
  if (!ctx.lambdaOmittedParams) return ERR('#NAME?')
  const argument = args[0]
  if (argument.kind === 'name' && ctx.lambdaOmittedParams.has(canonicalName(argument.name))) {
    return { kind: 'boolean', value: true }
  }
  const value = evaluate(argument, ctx)
  return value.kind === 'error' ? value : { kind: 'boolean', value: false }
}
