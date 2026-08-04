/** Reference-aware evaluator functions that retain expression-level semantics. */
import type { EvalContext, Expr, Value } from '../types'
import { arrayResult } from './array-shape'
import { canonicalName } from './canonical-name'
import { ERR } from './error-value'
import { getBuiltinFunction } from './functions'
import type { RuntimeRef } from './runtime-ref'
import type { RuntimeRefResult } from './runtime-ref-resolve'

export interface ReferenceFunctionDeps {
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
  readonly resolveIndexArgs: (args: ReadonlyArray<Expr>, ctx: EvalContext) => RuntimeRefResult
  readonly resolveIndirectArgs: (args: ReadonlyArray<Expr>, ctx: EvalContext) => RuntimeRefResult
  readonly resolveOffsetArgs: (args: ReadonlyArray<Expr>, ctx: EvalContext) => RuntimeRefResult
  readonly resolveSpillRef: (
    expr: Extract<Expr, { readonly kind: 'spillRef' }>,
    ctx: EvalContext,
  ) => RuntimeRefResult
  readonly evaluateRuntimeRef: (ref: RuntimeRef, ctx: EvalContext) => Value
}

export function evaluateMultiAreaArg(
  areas: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ReferenceFunctionDeps,
): Value {
  const rows: Value[][] = []
  for (const area of areas) {
    const resolved = deps.resolveRef(area, ctx)
    if (!resolved.ok) return resolved.error ?? ERR('#VALUE!')
    const value = deps.evaluateRuntimeRef(resolved.ref, ctx)
    if (value.kind === 'error') return value
    if (value.kind === 'array') {
      for (const row of value.value) {
        for (const cell of row) rows.push([cell])
      }
    } else {
      rows.push([value])
    }
  }
  return rows.length === 0 ? ERR('#VALUE!') : arrayResult(rows, 'multi-area result')
}

export function evaluateIndex(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ReferenceFunctionDeps,
): Value {
  const reference = deps.resolveIndexArgs(args, ctx)
  if (reference.ok) return deps.evaluateRuntimeRef(reference.ref, ctx)
  if (reference.error && isIndexReferenceSource(args[0], ctx)) return reference.error
  const builtin = getBuiltinFunction('INDEX')
  if (!builtin) return ERR('#NAME?', "function 'INDEX' is not registered")
  return builtin(
    args.map((arg) => deps.evaluateFunctionArg(arg, ctx)),
    ctx,
  )
}

function isIndexReferenceSource(expr: Expr | undefined, ctx: EvalContext): boolean {
  if (!expr) return false
  if (
    expr.kind === 'ref' ||
    expr.kind === 'range' ||
    expr.kind === 'dynamicRange' ||
    expr.kind === 'spillRef' ||
    expr.kind === 'crossSheet' ||
    expr.kind === 'multiArea'
  ) {
    return true
  }
  if (expr.kind === 'name') {
    const name = canonicalName(expr.name)
    if (ctx.lambdaScope?.get(name) !== undefined) return false
    if (ctx.lambdaRefScope?.has(name)) return true
    return ctx.resolveName(expr.name)?.kind === 'range'
  }
  return expr.kind === 'call' && ['OFFSET', 'INDIRECT', 'CHOOSE'].includes(expr.name.toUpperCase())
}

export function evaluateIndirect(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ReferenceFunctionDeps,
): Value {
  const reference = deps.resolveIndirectArgs(args, ctx)
  return reference.ok
    ? deps.evaluateRuntimeRef(reference.ref, ctx)
    : (reference.error ?? ERR('#REF!'))
}

export function evaluateOffset(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ReferenceFunctionDeps,
): Value {
  const reference = deps.resolveOffsetArgs(args, ctx)
  return reference.ok
    ? deps.evaluateRuntimeRef(reference.ref, ctx)
    : (reference.error ?? ERR('#VALUE!'))
}

export function evaluateSpillRef(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
  deps: ReferenceFunctionDeps,
): Value {
  const reference = deps.resolveSpillRef(expr, ctx)
  if (!reference.ok) return reference.error ?? ERR('#REF!')
  return reference.ref.materialized
    ? arrayResult(reference.ref.materialized, 'range result')
    : deps.evaluateRuntimeRef(reference.ref, ctx)
}
