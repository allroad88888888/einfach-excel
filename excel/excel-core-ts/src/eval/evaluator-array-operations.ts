/** Expression-aware array slicing, CHOOSE, and XLOOKUP operations. */
import { BLANK, type CellCoord, type EvalContext, type Expr, type Value } from '../types'
import { arrayResult, arrayShapeError } from './array-shape'
import { toNumber } from './coerce'
import { ERR } from './error-value'
import { resolveXLookupValue, type XLookupCoreResult } from './functions/lookup'
import type { RuntimeRef } from './runtime-ref'
import type { IntegerArgResult, RuntimeRefResult, SelectedExprResult } from './runtime-ref-resolve'

type SliceRangeResult =
  | { readonly ok: true; readonly start: number; readonly end: number }
  | { readonly ok: false; readonly error: Value }

export interface ArrayOperationDeps {
  readonly evaluateFunctionArg: (expr: Expr, ctx: EvalContext) => Value
  readonly resolveRef: (expr: Expr, ctx: EvalContext) => RuntimeRefResult
  readonly chooseSelectedExpr: (args: ReadonlyArray<Expr>, ctx: EvalContext) => SelectedExprResult
  readonly evaluateRuntimeRef: (ref: RuntimeRef, ctx: EvalContext) => Value
  readonly valueAt: (sheetName: string | undefined, coord: CellCoord, ctx: EvalContext) => Value
  readonly validateRef: (ref: RuntimeRef, ctx: EvalContext) => Value | undefined
}

export function evaluateTakeDrop(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  mode: 'take' | 'drop',
  deps: ArrayOperationDeps,
): Value | undefined {
  if (args.length < 2 || args.length > 3) {
    return ERR('#VALUE!', `${mode.toUpperCase()} needs 2-3 args`)
  }
  const source = deps.resolveRef(args[0], ctx)
  if (!source.ok) return source.error ?? undefined
  const sheetError = deps.validateRef(source.ref, ctx)
  if (sheetError) return sheetError
  const rows = source.ref.range.rowEnd - source.ref.range.rowStart + 1
  const cols = source.ref.range.colEnd - source.ref.range.colStart + 1
  const rowCount = evaluateIntegerArg(args[1], ctx, deps)
  if (!rowCount.ok) return rowCount.error
  const rowRange =
    mode === 'take' ? takeSliceRange(rows, rowCount.value) : dropSliceRange(rows, rowCount.value)
  if (!rowRange.ok) return rowRange.error
  let colStart = 0
  let colEnd = cols
  if (args.length === 3) {
    const columnCount = evaluateIntegerArg(args[2], ctx, deps)
    if (!columnCount.ok) return columnCount.error
    const columnRange =
      mode === 'take'
        ? takeSliceRange(cols, columnCount.value)
        : dropSliceRange(cols, columnCount.value)
    if (!columnRange.ok) return columnRange.error
    colStart = columnRange.start
    colEnd = columnRange.end
  }
  const outputRows = rowRange.end - rowRange.start
  const outputColumns = colEnd - colStart
  const shapeError = arrayShapeError(outputRows, outputColumns, `${mode.toUpperCase()} result`)
  if (shapeError) return shapeError
  return arrayResult(
    materializeRuntimeRefSlice(
      source.ref,
      rowRange.start,
      rowRange.end,
      colStart,
      colEnd,
      ctx,
      deps,
    ),
    `${mode.toUpperCase()} result`,
  )
}

function evaluateIntegerArg(
  expr: Expr,
  ctx: EvalContext,
  deps: ArrayOperationDeps,
): IntegerArgResult {
  const value = deps.evaluateFunctionArg(expr, ctx)
  if (value.kind === 'error') return { ok: false, error: value }
  const number = toNumber(value)
  if (!number.ok) return { ok: false, error: number.error }
  return Number.isFinite(number.value)
    ? { ok: true, value: Math.trunc(number.value) }
    : { ok: false, error: ERR('#NUM!') }
}

function takeSliceRange(size: number, count: number): SliceRangeResult {
  if (count === 0) return { ok: false, error: ERR('#CALC!') }
  const length = Math.min(Math.abs(count), size)
  if (length === 0) return { ok: false, error: ERR('#CALC!') }
  return count > 0
    ? { ok: true, start: 0, end: length }
    : { ok: true, start: size - length, end: size }
}

function dropSliceRange(size: number, count: number): SliceRangeResult {
  if (count === 0) return { ok: false, error: ERR('#CALC!') }
  if (count > 0) {
    const start = Math.min(count, size)
    return start >= size ? { ok: false, error: ERR('#CALC!') } : { ok: true, start, end: size }
  }
  const end = Math.max(0, size + count)
  return end <= 0 ? { ok: false, error: ERR('#CALC!') } : { ok: true, start: 0, end }
}

function materializeRuntimeRefSlice(
  ref: RuntimeRef,
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  ctx: EvalContext,
  deps: ArrayOperationDeps,
): Value[][] {
  const rows: Value[][] = []
  for (let row = rowStart; row < rowEnd; row += 1) {
    const values: Value[] = []
    for (let column = columnStart; column < columnEnd; column += 1) {
      if (ref.materialized) {
        values.push(ref.materialized[row]?.[column] ?? BLANK)
      } else {
        values.push(
          deps.valueAt(
            ref.sheetName,
            {
              row: ref.range.rowStart + row,
              col: ref.range.colStart + column,
            },
            ctx,
          ),
        )
      }
    }
    rows.push(values)
  }
  return rows
}

export function evaluateChoose(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ArrayOperationDeps,
  evaluateArrayChoose: (
    index: Extract<Value, { readonly kind: 'array' }>,
    values: ReadonlyArray<Expr>,
    context: EvalContext,
    evaluate: (expr: Expr, context: EvalContext) => Value,
  ) => Value,
): Value {
  if (args.length < 2) return ERR('#VALUE!')
  const index = deps.evaluateFunctionArg(args[0], ctx)
  if (index.kind === 'error') return index
  if (index.kind === 'array') return evaluateArrayChoose(index, args, ctx, deps.evaluateFunctionArg)
  const selected = deps.chooseSelectedExpr(args, ctx)
  return selected.ok ? deps.evaluateFunctionArg(selected.expr, ctx) : selected.error
}

export function evaluateXLookup(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ArrayOperationDeps,
): Value {
  const result = evaluateXLookupMatch(args, ctx, deps)
  if (result.kind === 'value') return result.value
  if (result.kind === 'error') return result.error
  if (args.length < 4) return ERR('#N/A')
  const fallback = deps.evaluateFunctionArg(args[3], ctx)
  return fallback.kind === 'blank' ? ERR('#N/A') : fallback
}

export function evaluateXLookupMatch(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: ArrayOperationDeps,
): XLookupCoreResult {
  if (args.length < 3 || args.length > 6) return { kind: 'error', error: ERR('#VALUE!') }
  const values = [0, 1, 2, 4, 5].map((index) =>
    index < args.length ? deps.evaluateFunctionArg(args[index], ctx) : undefined,
  )
  const error = values.find((value): value is Value => value?.kind === 'error')
  if (error) return { kind: 'error', error }
  return resolveXLookupValue(values[0]!, values[1]!, values[2]!, values[3], values[4])
}
