/**
 * `LambdaBinding` 这个抽象的一生。
 *
 * 职责：从 `LAMBDA(...)` 的实参造出一个绑定，把它套到一组实参上算出结果值
 * —— 含闭包作用域的复制、按参数名建的三张作用域表（值 / 引用 / 函数）、
 * 缺省实参的 `ISOMITTED` 标记、递归深度闸门。
 *
 * 「一个表达式**是不是** LAMBDA」是另一件事（`resolveLambdaExpr` 那一族），
 * 仍在 `evaluate.ts`：它要穿过 `IF` / `FILTER` / `LET` 等一堆返回值的函数，
 * 牵连的回调太多，这一程没动。
 *
 * 求值器是**参数**传进来的，不是 import 的：反向 import `evaluate.ts` 会成环。
 */
import type { EvalContext, Expr, LambdaBinding, Value } from '../types'
import { BLANK, MAX_LAMBDA_CALL_DEPTH } from '../types'
import { ERR } from './error-value'
import { canonicalName } from './canonical-name'
import type { RuntimeRef } from './runtime-ref'
import type { EvaluateExpr } from './trampoline'

export interface LambdaResolveResult {
  readonly lambda?: LambdaBinding
  readonly error?: Value
}

export interface LambdaArgumentValue {
  readonly kind: 'lambdaArgument'
  readonly lambda: LambdaBinding
}

export interface ReferenceArgumentValue {
  readonly kind: 'referenceArgument'
  readonly ref: RuntimeRef
}

export type LambdaArgument = Value | LambdaArgumentValue | ReferenceArgumentValue

export type LambdaContextResult =
  | { readonly ok: true; readonly subCtx: EvalContext; readonly depth: { count: number } }
  | { readonly ok: false; readonly error: Value }

export function isLambdaArgument(value: LambdaArgument | undefined): value is LambdaArgumentValue {
  return value?.kind === 'lambdaArgument'
}

export function isReferenceArgument(
  value: LambdaArgument | undefined,
): value is ReferenceArgumentValue {
  return value?.kind === 'referenceArgument'
}

export function makeLambdaBinding(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): LambdaResolveResult {
  if (args.length === 0) {
    return { error: ERR('#VALUE!', 'LAMBDA expects a body expression') }
  }
  const params: string[] = []
  for (const arg of args.slice(0, -1)) {
    if (arg.kind !== 'name') {
      return { error: ERR('#NAME?', 'LAMBDA parameter must be an identifier') }
    }
    params.push(canonicalName(arg.name))
  }
  return {
    lambda: {
      params,
      body: args[args.length - 1],
      closureScope: new Map(ctx.lambdaScope ?? []),
      closureRefScope: new Map(ctx.lambdaRefScope ?? []),
      closureFunctionScope: new Map(ctx.lambdaFunctionScope ?? []),
      closureOmittedParams: new Set(ctx.lambdaOmittedParams ?? []),
    },
  }
}

export function bindLambdaSelf(name: string, lambda: LambdaBinding): LambdaBinding {
  const functionScope = new Map<string, LambdaBinding>(lambda.closureFunctionScope ?? [])
  const recursive: LambdaBinding = {
    ...lambda,
    closureFunctionScope: functionScope,
  }
  functionScope.set(canonicalName(name), recursive)
  return recursive
}

export function applyLambda(
  lambda: LambdaBinding,
  args: ReadonlyArray<LambdaArgument>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): Value {
  const prepared = prepareLambdaContext(lambda, args, ctx)
  if (!prepared.ok) return prepared.error
  prepared.depth.count += 1
  try {
    return evaluate(lambda.body, prepared.subCtx)
  } finally {
    prepared.depth.count -= 1
  }
}

export function applyLambdaForArrayCell(
  lambda: LambdaBinding,
  args: ReadonlyArray<LambdaArgument>,
  ctx: EvalContext,
  evaluate: EvaluateExpr,
): { readonly ok: true; readonly value: Value } | { readonly ok: false; readonly error: Value } {
  const prepared = prepareLambdaContext(lambda, args, ctx)
  if (!prepared.ok) return { ok: false, error: prepared.error }
  prepared.depth.count += 1
  try {
    const value = evaluate(lambda.body, prepared.subCtx)
    if (value.kind === 'array') {
      return { ok: false, error: ERR('#CALC!', 'array result was not expanded') }
    }
    return { ok: true, value }
  } finally {
    prepared.depth.count -= 1
  }
}

export function prepareLambdaContext(
  lambda: LambdaBinding,
  args: ReadonlyArray<LambdaArgument>,
  ctx: EvalContext,
): LambdaContextResult {
  const depth = ctx.lambdaCallDepth ?? { count: 0 }
  if (args.length > lambda.params.length) {
    return { ok: false, error: ERR('#VALUE!') }
  }
  if (depth.count >= MAX_LAMBDA_CALL_DEPTH) {
    return {
      ok: false,
      error: ERR(
        '#NUM!',
        `LAMBDA recursion depth exceeded (${MAX_LAMBDA_CALL_DEPTH}); aborting to avoid stack overflow`,
      ),
    }
  }
  const scope = new Map<string, Value>(lambda.closureScope ?? [])
  const refScope = new Map<string, RuntimeRef>(lambda.closureRefScope ?? [])
  const functionScope = new Map<string, LambdaBinding>(
    lambda.closureFunctionScope ?? [],
  )
  const omitted = new Set<string>(lambda.closureOmittedParams ?? [])
  for (let i = 0; i < lambda.params.length; i += 1) {
    const name = canonicalName(lambda.params[i])
    const hasArg = i < args.length
    const arg = hasArg ? args[i] : undefined
    if (isLambdaArgument(arg)) {
      functionScope.set(name, arg.lambda)
      scope.delete(name)
      refScope.delete(name)
    } else if (isReferenceArgument(arg)) {
      refScope.set(name, arg.ref)
      scope.delete(name)
      functionScope.delete(name)
    } else {
      scope.set(name, arg ?? BLANK)
      refScope.delete(name)
      functionScope.delete(name)
    }
    if (hasArg) {
      omitted.delete(name)
    } else {
      omitted.add(name)
    }
  }
  const subCtx: EvalContext = {
    ...ctx,
    lambdaScope: scope,
    lambdaRefScope: refScope,
    lambdaFunctionScope: functionScope,
    lambdaOmittedParams: omitted,
    lambdaCallDepth: depth,
  }
  return { ok: true, subCtx, depth }
}
