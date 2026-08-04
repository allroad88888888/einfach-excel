/**
 * Public evaluator façade and the intentional sparse-family cycle boundary.
 *
 * Complex-file exception: this is the evaluator's single orchestration boundary.
 * Splitting its dependency assembly or dispatch routes would obscure the cycle-safe
 * contract between ordinary evaluation and sparse criteria evaluation.
 */
import type { Cell, CellCoord, CellKey, EvalContext, Expr, Value } from '../types'
import { ARRAY_CELL_CAP } from './array-shape'
import { evaluateArrayChoose } from './array-selectors'
import { parseRefToCoord, parseRefToKey } from './cell-address'
import { cycleGuardKey } from './cycle-guard'
import { evaluateCellInfo } from './cell-info'
import type { CriteriaValueDeps } from './criteria-value-range'
import { excelEquals } from './functions/logical'
import { evaluateCall as evaluateCallIn } from './evaluator-call'
import {
  evaluateChoose,
  evaluateTakeDrop,
  evaluateXLookup,
  evaluateXLookupMatch,
} from './evaluator-array-operations'
import {
  evaluateIf,
  evaluateIfError,
  evaluateIfNa,
  evaluateIfs,
  evaluateIsOmitted,
  evaluateLet,
  evaluateSwitch,
} from './evaluator-control-flow'
import { evaluateExpression } from './evaluator-expression'
import {
  evaluateIndex,
  evaluateIndirect,
  evaluateMultiAreaArg,
  evaluateOffset,
  evaluateSpillRef,
} from './evaluator-reference-functions'
import { ERR } from './error-value'
import { evaluateInForeignSheet as evaluateInForeignSheetWith } from './foreign-sheet'
import { valueToGrid, type Grid } from './grid'
import {
  evaluateByCol,
  evaluateByRow,
  evaluateMakeArray,
  evaluateMap,
  evaluateReduce,
  evaluateScan,
} from './higher-order'
import { evaluateFilter, selectFilterRows, tryEvaluateTocolSparse } from './higher-order-array'
import type { HigherOrderDeps } from './higher-order-deps'
import {
  resolveLambdaExpr as resolveLambdaExprIn,
  type LambdaResolutionDeps,
} from './lambda-resolution'
import { type LambdaArgument, type LambdaResolveResult } from './lambda-apply'
import {
  evaluateAreas,
  evaluateColumn,
  evaluateColumns,
  evaluateFormulaText,
  evaluateIsFormula,
  evaluateIsRef,
  evaluateRow,
  evaluateRows,
  evaluateSheet,
  evaluateSheets,
  type RefInfoDeps,
} from './reference-info'
import {
  canSparseIterate,
  rangeCellCount,
  validateRuntimeRefSheet,
  type RuntimeRef,
} from './runtime-ref'
import {
  runtimeRefFromExpr as resolveRefFromExpr,
  runtimeRefFromIndexArgs as resolveIndexArgs,
  runtimeRefFromIndirectArgs as resolveIndirectArgs,
  runtimeRefFromOffsetArgs as resolveOffsetArgs,
  runtimeRefFromSpillRef as resolveSpillRefArgs,
  chooseSelectedExpr as resolveChooseSelectedExpr,
  type RefResolveDeps,
  type RuntimeRefResult,
} from './runtime-ref-resolve'
import {
  evaluateRuntimeRef as evaluateRuntimeRefIn,
  rawValueAtRuntimeCoord as rawValueAtRuntimeCoordIn,
  sparseValuesForRef as sparseValuesForRefIn,
  valueAtRuntimeCoord as valueAtRuntimeCoordIn,
} from './runtime-ref-read'
import {
  evaluateSparseCountA,
  evaluateSparseCountBlank,
  evaluateSparseNumericAggregate,
  evaluateSparseSum,
} from './sparse-aggregations'
import {
  evaluateSparseAverageIf,
  evaluateSparseCountIf,
  evaluateSparseSumIf,
} from './sparse-single-criterion'
import {
  evaluateSparseAverageIfs,
  evaluateSparseCountIfs,
  evaluateSparseMinMaxIfs,
  evaluateSparseSumIfs,
} from './sparse-multi-criterion'
import { evaluateSparseAggregate, evaluateSparseSubtotal } from './sparse-subtotal'
import { evaluateCellTrampolined as evaluateCellWithWorkStack } from './trampoline'
import { rangeLookupGeneric as rangeLookupIn, refLookupGeneric as refLookupIn } from './cell-read'
import { anchorScalar } from './spill-projection'

const REF_RESOLVE_DEPS: RefResolveDeps = { evaluate, rawValueAt: rawValueAtRuntimeCoord }
const REF_INFO_DEPS: RefInfoDeps = { evaluate, resolveRef: runtimeRefFromExpr, evaluateRuntimeRef }
const CRITERIA_VALUE_DEPS: CriteriaValueDeps = {
  resolveRef: runtimeRefFromExpr,
  valueAt: valueAtRuntimeCoord,
}

const HIGHER_ORDER_DEPS: HigherOrderDeps = {
  evaluate,
  evaluateFunctionArg,
  evaluateGrid,
  requireLambda,
  resolveRef: runtimeRefFromExpr,
  sparseValues: sparseValuesForRef,
}

const LAMBDA_DEPS: LambdaResolutionDeps = {
  evaluate,
  evaluateFunctionArg,
  evaluateLambdaArg,
  resolveRef: runtimeRefFromExpr,
  chooseSelectedExpr,
  selectFilterRows: (array, include, ctx) =>
    selectFilterRows(array, include, ctx, HIGHER_ORDER_DEPS),
  evaluateXLookupMatch: (args, ctx) => evaluateXLookupMatch(args, ctx, ARRAY_OPERATION_DEPS),
}

const REFERENCE_FUNCTION_DEPS = {
  evaluateFunctionArg,
  resolveRef: runtimeRefFromExpr,
  resolveIndexArgs: runtimeRefFromIndexArgs,
  resolveIndirectArgs: runtimeRefFromIndirectArgs,
  resolveOffsetArgs: runtimeRefFromOffsetArgs,
  resolveSpillRef: runtimeRefFromSpillRef,
  evaluateRuntimeRef,
}

const ARRAY_OPERATION_DEPS = {
  evaluateFunctionArg,
  resolveRef: runtimeRefFromExpr,
  chooseSelectedExpr,
  evaluateRuntimeRef,
  valueAt: valueAtRuntimeCoord,
  validateRef: validateRuntimeRefSheet,
}

const CONTROL_FLOW_DEPS = {
  evaluate,
  evaluateFunctionArg,
  resolveLambda: resolveLambdaExpr,
  resolveRef: runtimeRefFromExpr,
}

export function evaluate(ast: Expr, ctx: EvalContext): Value {
  return evaluateExpression(ast, ctx, {
    evaluate,
    evaluateCall: (call, context) =>
      evaluateCallIn(call, context, {
        evaluate,
        evaluateFunctionArg,
        evaluateLambdaArg,
        evaluateSpecial,
        criteriaValueDeps: CRITERIA_VALUE_DEPS,
      }),
    anchorScalar,
    resolveLambda: resolveLambdaExpr,
    evaluateLambdaArg,
    resolveRef: runtimeRefFromExpr,
    evaluateRuntimeRef,
    evaluateSpillRef: (spill, context) => evaluateSpillRef(spill, context, REFERENCE_FUNCTION_DEPS),
    evaluateInForeignSheet,
  })
}

export function evaluateFunctionArg(expr: Expr, ctx: EvalContext): Value {
  return expr.kind === 'multiArea'
    ? evaluateMultiAreaArg(expr.areas, ctx, REFERENCE_FUNCTION_DEPS)
    : evaluate(expr, ctx)
}

export function runtimeRefFromExpr(expr: Expr, ctx?: EvalContext): RuntimeRefResult {
  return resolveRefFromExpr(expr, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromIndirectArgs(args: ReadonlyArray<Expr>, ctx: EvalContext): RuntimeRefResult {
  return resolveIndirectArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromOffsetArgs(args: ReadonlyArray<Expr>, ctx: EvalContext): RuntimeRefResult {
  return resolveOffsetArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromIndexArgs(args: ReadonlyArray<Expr>, ctx: EvalContext): RuntimeRefResult {
  return resolveIndexArgs(args, ctx, REF_RESOLVE_DEPS)
}

function runtimeRefFromSpillRef(
  expr: Extract<Expr, { readonly kind: 'spillRef' }>,
  ctx: EvalContext,
): RuntimeRefResult {
  return resolveSpillRefArgs(expr, ctx, REF_RESOLVE_DEPS)
}

function chooseSelectedExpr(args: ReadonlyArray<Expr>, ctx: EvalContext) {
  return resolveChooseSelectedExpr(args, ctx, REF_RESOLVE_DEPS)
}

function evaluateLambdaArg(expr: Expr, ctx: EvalContext): LambdaArgument {
  const resolved = resolveLambdaExpr(expr, ctx)
  if (resolved.error) return resolved.error
  if (resolved.lambda) return { kind: 'lambdaArgument', lambda: resolved.lambda }
  const reference = runtimeRefFromExpr(expr, ctx)
  if (reference.ok) return { kind: 'referenceArgument', ref: reference.ref }
  if (reference.error) return reference.error
  return evaluateFunctionArg(expr, ctx)
}

function requireLambda(
  expr: Expr,
  ctx: EvalContext,
  arity: number,
):
  | { readonly lambda: NonNullable<LambdaResolveResult['lambda']>; readonly error?: undefined }
  | { readonly error: Value } {
  const resolved = resolveLambdaExpr(expr, ctx)
  if (resolved.error) return { error: resolved.error }
  if (!resolved.lambda) return { error: ERR('#VALUE!', 'expected LAMBDA') }
  return resolved.lambda.params.length === arity
    ? { lambda: resolved.lambda }
    : { error: ERR('#VALUE!', `LAMBDA expects ${arity} parameters`) }
}

function resolveLambdaExpr(expr: Expr, ctx: EvalContext): LambdaResolveResult {
  return resolveLambdaExprIn(expr, ctx, LAMBDA_DEPS)
}

function evaluateGrid(
  expr: Expr,
  ctx: EvalContext,
): { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value } {
  const value = evaluate(expr, ctx)
  return value.kind === 'error' ? { error: value } : valueToGrid(value)
}

function evaluateSpecial(
  name: string,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  const sparse = evaluateSparseCall(name, args, ctx)
  if (sparse !== undefined) return sparse
  switch (name) {
    case 'IF':
      return evaluateIf(args, ctx, CONTROL_FLOW_DEPS)
    case 'IFERROR':
      return evaluateIfError(args, ctx, CONTROL_FLOW_DEPS)
    case 'IFNA':
      return evaluateIfNa(args, ctx, CONTROL_FLOW_DEPS)
    case 'IFS':
      return evaluateIfs(args, ctx, CONTROL_FLOW_DEPS)
    case 'SWITCH':
      return evaluateSwitch(args, ctx, CONTROL_FLOW_DEPS, excelEquals)
    case 'LET':
      return evaluateLet(args, ctx, CONTROL_FLOW_DEPS)
    case 'LAMBDA':
      return ERR('#CALC!', 'LAMBDA must be invoked or passed to a higher-order function')
    case 'ISOMITTED':
      return evaluateIsOmitted(args, ctx, evaluate)
    case 'MAP':
      return evaluateMap(args, ctx, HIGHER_ORDER_DEPS)
    case 'REDUCE':
      return evaluateReduce(args, ctx, HIGHER_ORDER_DEPS)
    case 'SCAN':
      return evaluateScan(args, ctx, HIGHER_ORDER_DEPS)
    case 'BYROW':
      return evaluateByRow(args, ctx, HIGHER_ORDER_DEPS)
    case 'BYCOL':
      return evaluateByCol(args, ctx, HIGHER_ORDER_DEPS)
    case 'MAKEARRAY':
      return evaluateMakeArray(args, ctx, HIGHER_ORDER_DEPS)
    case 'FILTER':
      return evaluateFilter(args, ctx, HIGHER_ORDER_DEPS)
    case 'TOCOL':
      return tryEvaluateTocolSparse(args, ctx, HIGHER_ORDER_DEPS)
    case 'TAKE':
      return evaluateTakeDrop(args, ctx, 'take', ARRAY_OPERATION_DEPS)
    case 'DROP':
      return evaluateTakeDrop(args, ctx, 'drop', ARRAY_OPERATION_DEPS)
    case 'CHOOSE':
      return evaluateChoose(args, ctx, ARRAY_OPERATION_DEPS, evaluateArrayChoose)
    case 'XLOOKUP':
      return evaluateXLookup(args, ctx, ARRAY_OPERATION_DEPS)
    case 'INDEX':
      return evaluateIndex(args, ctx, REFERENCE_FUNCTION_DEPS)
    case 'ISFORMULA':
      return evaluateIsFormula(args, ctx, REF_INFO_DEPS)
    case 'ISREF':
      return evaluateIsRef(args, ctx, REF_INFO_DEPS)
    case 'SHEET':
      return evaluateSheet(args, ctx, REF_INFO_DEPS)
    case 'SHEETS':
      return evaluateSheets(args, ctx, REF_INFO_DEPS)
    case 'AREAS':
      return evaluateAreas(args, ctx, REF_INFO_DEPS)
    case 'FORMULATEXT':
      return evaluateFormulaText(args, ctx, REF_INFO_DEPS)
    case 'CELL':
      return evaluateCellInfo(args, ctx, REF_INFO_DEPS)
    case 'INDIRECT':
      return evaluateIndirect(args, ctx, REFERENCE_FUNCTION_DEPS)
    case 'OFFSET':
      return evaluateOffset(args, ctx, REFERENCE_FUNCTION_DEPS)
    case 'ROW':
      return evaluateRow(args, ctx, REF_INFO_DEPS)
    case 'COLUMN':
      return evaluateColumn(args, ctx, REF_INFO_DEPS)
    case 'ROWS':
      return evaluateRows(args, ctx, REF_INFO_DEPS)
    case 'COLUMNS':
      return evaluateColumns(args, ctx, REF_INFO_DEPS)
  }
  return undefined
}

function evaluateSparseCall(
  name: string,
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
): Value | undefined {
  switch (name) {
    case 'SUM':
      return evaluateSparseSum(args, ctx)
    case 'COUNT':
      return evaluateSparseNumericAggregate(args, ctx, 'count')
    case 'COUNTA':
      return evaluateSparseCountA(args, ctx)
    case 'COUNTBLANK':
      return evaluateSparseCountBlank(args, ctx)
    case 'AVERAGE':
      return evaluateSparseNumericAggregate(args, ctx, 'average')
    case 'MIN':
      return evaluateSparseNumericAggregate(args, ctx, 'min')
    case 'MAX':
      return evaluateSparseNumericAggregate(args, ctx, 'max')
    case 'COUNTIF':
      return evaluateSparseCountIf(args, ctx)
    case 'SUMIF':
      return evaluateSparseSumIf(args, ctx)
    case 'AVERAGEIF':
      return evaluateSparseAverageIf(args, ctx)
    case 'COUNTIFS':
      return evaluateSparseCountIfs(args, ctx)
    case 'SUMIFS':
      return evaluateSparseSumIfs(args, ctx)
    case 'AVERAGEIFS':
      return evaluateSparseAverageIfs(args, ctx)
    case 'MAXIFS':
      return evaluateSparseMinMaxIfs(args, ctx, 'max')
    case 'MINIFS':
      return evaluateSparseMinMaxIfs(args, ctx, 'min')
    case 'SUBTOTAL':
      return evaluateSparseSubtotal(args, ctx)
    case 'AGGREGATE':
      return evaluateSparseAggregate(args, ctx)
  }
  return undefined
}

export function refLookupGeneric(
  a1: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
): Value {
  return refLookupIn(a1, cells, ctx, evaluate)
}

export function rangeLookupGeneric(
  start: string,
  end: string,
  cells: ReadonlyMap<CellKey, Cell>,
  ctx: EvalContext,
): Value[][] {
  return rangeLookupIn(start, end, cells, ctx, evaluate)
}

function evaluateRuntimeRef(ref: RuntimeRef, ctx: EvalContext, scalarTopLeft = false): Value {
  return evaluateRuntimeRefIn(ref, ctx, scalarTopLeft, evaluate)
}

export function sparseValuesForRef(
  ref: RuntimeRef,
  ctx: EvalContext,
): ReturnType<typeof sparseValuesForRefIn> {
  return sparseValuesForRefIn(ref, ctx, evaluate)
}

export function valueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
): Value {
  return valueAtRuntimeCoordIn(sheetName, coord, ctx, evaluate)
}

function rawValueAtRuntimeCoord(
  sheetName: string | undefined,
  coord: CellCoord,
  ctx: EvalContext,
): Value {
  return rawValueAtRuntimeCoordIn(sheetName, coord, ctx, evaluate)
}

function evaluateInForeignSheet(
  inner: Expr,
  parent: EvalContext,
  foreignCells: ReadonlyMap<CellKey, Cell>,
  sheetName?: string,
): Value {
  return evaluateInForeignSheetWith(inner, parent, foreignCells, sheetName, evaluate)
}

export function evaluateCellTrampolined(
  rootKey: CellKey,
  rootCells: ReadonlyMap<CellKey, Cell>,
  hostCtx: EvalContext,
): Value {
  return evaluateCellWithWorkStack(rootKey, rootCells, hostCtx, evaluate)
}

export {
  ERR,
  ARRAY_CELL_CAP,
  canSparseIterate,
  rangeCellCount,
  cycleGuardKey,
  parseRefToCoord,
  parseRefToKey,
}
