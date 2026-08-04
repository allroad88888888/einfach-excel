/** Dispatches call expressions after façade-owned evaluator-aware interception. */
import type { CallExpr, EvalContext, Expr, Value } from '../types'
import { canonicalName } from './canonical-name'
import { alignCriteriaValueArg, type CriteriaValueDeps } from './criteria-value-range'
import { ERR } from './error-value'
import { getBuiltinFunction } from './functions'
import { applyLambda, type LambdaArgument } from './lambda-apply'

export interface CallEvaluatorDeps {
  readonly evaluate: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateLambdaArg: (expr: Expr, ctx: EvalContext) => LambdaArgument
  readonly evaluateSpecial: (
    name: string,
    args: ReadonlyArray<Expr>,
    ctx: EvalContext,
  ) => Value | undefined
  readonly criteriaValueDeps: CriteriaValueDeps
}

export function evaluateCall(expr: CallExpr, ctx: EvalContext, deps: CallEvaluatorDeps): Value {
  const name = expr.name.toUpperCase()
  const special = deps.evaluateSpecial(name, expr.args, ctx)
  if (special !== undefined) return special
  const builtin = getBuiltinFunction(expr.name)
  if (builtin) {
    const aligned = alignCriteriaValueArg(name, expr.args, ctx, deps.criteriaValueDeps)
    const values = expr.args.map((arg, index) =>
      aligned && index === aligned.index ? aligned.value : deps.evaluateFunctionArg(arg, ctx),
    )
    return builtin(values, ctx)
  }
  const scoped = ctx.lambdaFunctionScope?.get(canonicalName(expr.name))
  if (scoped) return applyScopedLambda(scoped, expr.args, ctx, deps)
  const binding = ctx.resolveName(expr.name)
  if (binding?.kind === 'lambda') return applyScopedLambda(binding, expr.args, ctx, deps)
  const values = expr.args.map((arg) => deps.evaluateFunctionArg(arg, ctx))
  const custom = ctx.callCustom(expr.name, values, {
    sheetName: ctx.currentSheetName,
    cell: ctx.currentCell,
  })
  return custom ?? ERR('#NAME?', `function '${expr.name}' is not registered`)
}

function applyScopedLambda(
  lambda: Parameters<typeof applyLambda>[0],
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: CallEvaluatorDeps,
): Value {
  const values: LambdaArgument[] = args.map((arg) => deps.evaluateLambdaArg(arg, ctx))
  return applyLambda(lambda, values, ctx, deps.evaluate)
}
