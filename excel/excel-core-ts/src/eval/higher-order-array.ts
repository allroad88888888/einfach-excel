/** Materialized FILTER evaluation and its array-shape selection helper. */
import type { EvalContext, Expr, Value } from '../types'
import { arrayResult } from './array-shape'
import { toBoolean } from './coerce'
import { ERR } from './error-value'
import type { HigherOrderDeps } from './higher-order-deps'
import { evaluateFilterSparse, evaluateTocolSparse } from './higher-order-sparse'

export type FilterRowsResult =
  | { readonly ok: true; readonly rows: Value[][] }
  | { readonly ok: false; readonly error: Value }

export function evaluateFilter(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length < 2 || args.length > 3) return ERR('#VALUE!', 'FILTER needs 2-3 args')
  const sparse = evaluateFilterSparse(args, ctx, deps)
  if (sparse !== undefined) return sparse
  const filtered = selectFilterRows(args[0], args[1], ctx, deps)
  if (!filtered.ok) return filtered.error
  if (filtered.rows.length > 0 && filtered.rows[0]?.length > 0) {
    return arrayResult(filtered.rows, 'FILTER result')
  }
  return args.length === 3
    ? deps.evaluateFunctionArg(args[2], ctx)
    : ERR('#CALC!', 'FILTER returned empty result')
}

export function tryEvaluateTocolSparse(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value | undefined {
  return evaluateTocolSparse(args, ctx, deps)
}

export function selectFilterRows(
  arrayExpr: Expr,
  includeExpr: Expr,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): FilterRowsResult {
  const arrayGrid = deps.evaluateGrid(arrayExpr, ctx)
  if (arrayGrid.error) return { ok: false, error: arrayGrid.error }
  const includeGrid = deps.evaluateGrid(includeExpr, ctx)
  if (includeGrid.error) return { ok: false, error: includeGrid.error }
  const { rows, cols, cells } = arrayGrid.grid
  const { rows: maskRows, cols: maskCols, cells: mask } = includeGrid.grid
  if (maskRows === rows && maskCols === 1) {
    const kept: Value[][] = []
    for (let row = 0; row < rows; row += 1) {
      const condition = toBoolean(mask[row][0])
      if (!condition.ok) return { ok: false, error: condition.error }
      if (condition.value) kept.push(cells[row].slice())
    }
    return { ok: true, rows: kept }
  }
  if (maskRows === 1 && maskCols === cols) {
    const columns: number[] = []
    for (let column = 0; column < cols; column += 1) {
      const condition = toBoolean(mask[0][column])
      if (!condition.ok) return { ok: false, error: condition.error }
      if (condition.value) columns.push(column)
    }
    return { ok: true, rows: cells.map((row) => columns.map((column) => row[column])) }
  }
  return { ok: false, error: ERR('#VALUE!', 'FILTER mask shape mismatch') }
}
