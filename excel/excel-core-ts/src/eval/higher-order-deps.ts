/**
 * Callback boundary for evaluator-aware array functions.
 *
 * The concrete evaluator binds these callbacks in `evaluate.ts`.  Keeping
 * this contract one-way prevents higher-order helpers from importing the
 * evaluator and accidentally expanding the intentional sparse SCC.
 */
import type { EvalContext, Expr, LambdaBinding, Value } from '../types'
import type { Grid } from './grid'
import type { RuntimeRef } from './runtime-ref'
import type { RuntimeRefResult } from './runtime-ref-resolve'

export type LambdaRequirement =
  | { readonly lambda: LambdaBinding; readonly error?: undefined }
  | { readonly error: Value }

export interface HigherOrderDeps {
  readonly evaluate: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly evaluateGrid: (
    expr: Expr,
    ctx: EvalContext,
  ) => { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value }
  readonly requireLambda: (expr: Expr, ctx: EvalContext, arity: number) => LambdaRequirement
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
  readonly sparseValues: (
    ref: RuntimeRef,
    ctx: EvalContext,
  ) =>
    | { readonly ok: true; readonly values: ReadonlyArray<{ readonly value: Value }> }
    | { readonly ok: false; readonly error: Value }
}
