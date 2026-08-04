/** Evaluates non-call expression syntax using façade-provided capabilities. */
import type { Cell, CellKey, EvalContext, Expr, Value } from '../types'
import { BLANK } from '../types'
import { arrayResult, scalarCellError } from './array-shape'
import { applyBinary } from './binary-ops'
import { canonicalName } from './canonical-name'
import { propagateError, toNumber } from './coerce'
import { ERR } from './error-value'
import { rangeRowsToValue } from './range-gate'
import { applyLambda, type LambdaArgument, type LambdaResolveResult } from './lambda-apply'
import type { RuntimeRef } from './runtime-ref'

export interface ExpressionDeps {
  readonly evaluate: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateCall: (expr: Extract<Expr, { readonly kind: 'call' }>, ctx: EvalContext) => Value
  readonly anchorScalar: (value: Value) => Value
  readonly resolveLambda: (expr: Expr, ctx: EvalContext) => LambdaResolveResult
  readonly evaluateLambdaArg: (expr: Expr, ctx: EvalContext) => LambdaArgument
  readonly resolveRef: (
    expr: Expr,
    ctx: EvalContext,
  ) =>
    | { readonly ok: true; readonly ref: RuntimeRef }
    | { readonly ok: false; readonly error?: Value }
  readonly evaluateRuntimeRef: (ref: RuntimeRef, ctx: EvalContext) => Value
  readonly evaluateSpillRef: (
    expr: Extract<Expr, { readonly kind: 'spillRef' }>,
    ctx: EvalContext,
  ) => Value
  readonly evaluateInForeignSheet: (
    inner: Expr,
    parent: EvalContext,
    foreignCells: ReadonlyMap<CellKey, Cell>,
    sheetName?: string,
  ) => Value
}

export function evaluateExpression(ast: Expr, ctx: EvalContext, deps: ExpressionDeps): Value {
  switch (ast.kind) {
    case 'number':
      return { kind: 'number', value: ast.value }
    case 'string':
      return { kind: 'string', value: ast.value }
    case 'boolean':
      return { kind: 'boolean', value: ast.value }
    case 'error':
      return { kind: 'error', code: ast.code }
    case 'omitted':
      return BLANK
    case 'ref':
      return ctx.refLookup(ast.a1)
    case 'range':
      return rangeRowsToValue(ctx.rangeLookup(ast.start, ast.end))
    case 'dynamicRange': {
      const reference = deps.resolveRef(ast, ctx)
      return reference.ok
        ? deps.evaluateRuntimeRef(reference.ref, ctx)
        : (reference.error ?? ERR('#VALUE!'))
    }
    case 'spillRef':
      return deps.evaluateSpillRef(ast, ctx)
    case 'crossSheet':
      return evaluateCrossSheet(ast, ctx, deps)
    case 'multiArea':
      return ERR('#VALUE!', 'multi-area references are only supported by evaluator-aware functions')
    case 'name':
      return evaluateName(ast, ctx, deps)
    case 'unary':
      return evaluateUnary(ast, ctx, deps)
    case 'percent':
      return evaluatePercent(ast, ctx, deps)
    case 'binary':
      return applyBinary(ast.op, deps.evaluate(ast.left, ctx), deps.evaluate(ast.right, ctx))
    case 'arrayLiteral':
      return evaluateArrayLiteral(ast, ctx, deps)
    case 'lambdaCall':
      return evaluateLambdaCall(ast, ctx, deps)
    case 'call':
      return deps.evaluateCall(ast, ctx)
  }
}

function evaluateCrossSheet(
  ast: Extract<Expr, { readonly kind: 'crossSheet' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const cells = ctx.crossSheetCells(ast.sheetName)
  if (!cells) return ERR('#REF!')
  const value = deps.evaluateInForeignSheet(ast.inner, ctx, cells, ast.sheetName)
  return ast.inner.kind === 'ref' ? deps.anchorScalar(value) : value
}

function evaluateName(
  ast: Extract<Expr, { readonly kind: 'name' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const name = canonicalName(ast.name)
  const scopedValue = ctx.lambdaScope?.get(name)
  if (scopedValue !== undefined) return scopedValue
  const scopedReference = ctx.lambdaRefScope?.get(name)
  if (scopedReference) return deps.evaluateRuntimeRef(scopedReference, ctx)
  if (ctx.lambdaFunctionScope?.has(name)) {
    return ERR(
      '#CALC!',
      `LAMBDA '${ast.name}' must be invoked or passed to an evaluator-aware function`,
    )
  }
  const binding = ctx.resolveName(ast.name)
  if (!binding) return ERR('#NAME?')
  if (binding.kind === 'value') return binding.value
  if (binding.kind === 'lambda') {
    return ERR(
      '#CALC!',
      `LAMBDA '${ast.name}' must be invoked with arguments (e.g. =${ast.name}(...))`,
    )
  }
  if (binding.sheetName === undefined)
    return rangeRowsToValue(ctx.rangeLookup(binding.start, binding.end))
  const cells = ctx.crossSheetCells(binding.sheetName)
  return cells
    ? deps.evaluateInForeignSheet(
        { kind: 'range', start: binding.start, end: binding.end },
        ctx,
        cells,
        binding.sheetName,
      )
    : ERR('#REF!')
}

function evaluateUnary(
  ast: Extract<Expr, { readonly kind: 'unary' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const value = deps.evaluate(ast.operand, ctx)
  const propagated = propagateError([value])
  if (propagated) return propagated
  const number = toNumber(value)
  return number.ok
    ? { kind: 'number', value: ast.op === '-' ? -number.value : number.value }
    : number.error
}

function evaluatePercent(
  ast: Extract<Expr, { readonly kind: 'percent' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const value = deps.evaluate(ast.operand, ctx)
  const propagated = propagateError([value])
  if (propagated) return propagated
  const number = toNumber(value)
  return number.ok ? { kind: 'number', value: number.value / 100 } : number.error
}

function evaluateArrayLiteral(
  ast: Extract<Expr, { readonly kind: 'arrayLiteral' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const rows: Value[][] = []
  for (const expressions of ast.rows) {
    const values: Value[] = []
    for (const expression of expressions) {
      const value = deps.evaluate(expression, ctx)
      const scalarError = scalarCellError(value)
      if (scalarError) return scalarError
      values.push(value)
    }
    rows.push(values)
  }
  return rows.length === 0 || rows[0].length === 0
    ? ERR('#VALUE!')
    : arrayResult(rows, 'array literal')
}

function evaluateLambdaCall(
  ast: Extract<Expr, { readonly kind: 'lambdaCall' }>,
  ctx: EvalContext,
  deps: ExpressionDeps,
): Value {
  const resolved = deps.resolveLambda(ast.callee, ctx)
  if (resolved.error) return resolved.error
  if (!resolved.lambda) {
    const value = deps.evaluate(ast.callee, ctx)
    return value.kind === 'error' ? value : ERR('#VALUE!', 'expected LAMBDA')
  }
  return applyLambda(
    resolved.lambda,
    ast.args.map((arg) => deps.evaluateLambdaArg(arg, ctx)),
    ctx,
    deps.evaluate,
  )
}
