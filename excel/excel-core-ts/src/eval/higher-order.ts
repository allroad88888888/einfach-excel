/** Materialized MAP, REDUCE, SCAN, BYROW, BYCOL and MAKEARRAY evaluation. */
import type { EvalContext, Expr, Value } from '../types'
import { arrayResult, arrayShapeError } from './array-shape'
import { toNumber } from './coerce'
import { ERR } from './error-value'
import { makeMatrix, type Grid } from './grid'
import { applyLambda, applyLambdaForArrayCell } from './lambda-apply'
import type { HigherOrderDeps } from './higher-order-deps'
import { evaluateMapSparse } from './higher-order-sparse'

export function evaluateMap(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length < 2) return ERR('#VALUE!', 'MAP expects at least 2 arguments')
  const lambda = deps.requireLambda(args[args.length - 1], ctx, args.length - 1)
  if (lambda.error) return lambda.error
  if (args.length === 2) {
    const sparse = evaluateMapSparse(args[0], lambda.lambda, ctx, deps)
    if (sparse !== undefined) return sparse
  }

  const grids: Grid[] = []
  for (const arg of args.slice(0, -1)) {
    const grid = deps.evaluateGrid(arg, ctx)
    if (grid.error) return grid.error
    grids.push(grid.grid)
  }
  const first = grids[0]
  if (!first || first.rows === 0 || first.cols === 0) return ERR('#VALUE!')
  const shapeError = arrayShapeError(first.rows, first.cols, 'MAP result')
  if (shapeError) return shapeError
  if (grids.slice(1).some((grid) => grid.rows !== first.rows || grid.cols !== first.cols)) {
    return ERR('#VALUE!', 'MAP input arrays must have the same shape')
  }
  const out = makeMatrix(first.rows, first.cols)
  for (let row = 0; row < first.rows; row += 1) {
    for (let column = 0; column < first.cols; column += 1) {
      const values = grids.map((grid) => grid.cells[row][column])
      const result = applyLambdaForArrayCell(lambda.lambda, values, ctx, deps.evaluate)
      if (!result.ok) return result.error
      out[row][column] = result.value
    }
  }
  return arrayResult(out, 'MAP result')
}

export function evaluateReduce(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'REDUCE expects 3 arguments')
  const initial = deps.evaluate(args[0], ctx)
  if (initial.kind === 'error') return initial
  const grid = deps.evaluateGrid(args[1], ctx)
  if (grid.error) return grid.error
  const shapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'REDUCE input')
  if (shapeError) return shapeError
  const lambda = deps.requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  let accumulator: Value = initial
  for (const row of grid.grid.cells) {
    for (const value of row) {
      accumulator = applyLambda(lambda.lambda, [accumulator, value], ctx, deps.evaluate)
      if (accumulator.kind === 'error') return accumulator
    }
  }
  return accumulator
}

export function evaluateScan(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'SCAN expects 3 arguments')
  const initial = deps.evaluate(args[0], ctx)
  if (initial.kind === 'error') return initial
  const grid = deps.evaluateGrid(args[1], ctx)
  if (grid.error) return grid.error
  const lambda = deps.requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  const shapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'SCAN result')
  if (shapeError) return shapeError
  const out = makeMatrix(grid.grid.rows, grid.grid.cols)
  let accumulator: Value = initial
  for (let row = 0; row < grid.grid.rows; row += 1) {
    for (let column = 0; column < grid.grid.cols; column += 1) {
      const result = applyLambdaForArrayCell(
        lambda.lambda,
        [accumulator, grid.grid.cells[row][column]],
        ctx,
        deps.evaluate,
      )
      if (!result.ok) return result.error
      accumulator = result.value
      out[row][column] = result.value
    }
  }
  return arrayResult(out, 'SCAN result')
}

export function evaluateByRow(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length !== 2) return ERR('#VALUE!', 'BYROW expects 2 arguments')
  const grid = deps.evaluateGrid(args[0], ctx)
  if (grid.error) return grid.error
  const inputShapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'BYROW input')
  if (inputShapeError) return inputShapeError
  const outputShapeError = arrayShapeError(grid.grid.rows, 1, 'BYROW result')
  if (outputShapeError) return outputShapeError
  const lambda = deps.requireLambda(args[1], ctx, 1)
  if (lambda.error) return lambda.error
  const out = makeMatrix(grid.grid.rows, 1)
  for (let row = 0; row < grid.grid.rows; row += 1) {
    const result = applyLambdaForArrayCell(
      lambda.lambda,
      [{ kind: 'array', value: [grid.grid.cells[row].slice()] }],
      ctx,
      deps.evaluate,
    )
    if (!result.ok) return result.error
    out[row][0] = result.value
  }
  return arrayResult(out, 'BYROW result')
}

export function evaluateByCol(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length !== 2) return ERR('#VALUE!', 'BYCOL expects 2 arguments')
  const grid = deps.evaluateGrid(args[0], ctx)
  if (grid.error) return grid.error
  const inputShapeError = arrayShapeError(grid.grid.rows, grid.grid.cols, 'BYCOL input')
  if (inputShapeError) return inputShapeError
  const outputShapeError = arrayShapeError(1, grid.grid.cols, 'BYCOL result')
  if (outputShapeError) return outputShapeError
  const lambda = deps.requireLambda(args[1], ctx, 1)
  if (lambda.error) return lambda.error
  const out = makeMatrix(1, grid.grid.cols)
  for (let column = 0; column < grid.grid.cols; column += 1) {
    const values = grid.grid.cells.map((row) => [row[column]])
    const result = applyLambdaForArrayCell(
      lambda.lambda,
      [{ kind: 'array', value: values }],
      ctx,
      deps.evaluate,
    )
    if (!result.ok) return result.error
    out[0][column] = result.value
  }
  return arrayResult(out, 'BYCOL result')
}

export function evaluateMakeArray(
  args: ReadonlyArray<Expr>,
  ctx: EvalContext,
  deps: HigherOrderDeps,
): Value {
  if (args.length !== 3) return ERR('#VALUE!', 'MAKEARRAY expects 3 arguments')
  const rowValue = deps.evaluate(args[0], ctx)
  if (rowValue.kind === 'error') return rowValue
  const columnValue = deps.evaluate(args[1], ctx)
  if (columnValue.kind === 'error') return columnValue
  const rows = toNumber(rowValue)
  if (!rows.ok) return rows.error
  const columns = toNumber(columnValue)
  if (!columns.ok) return columns.error
  const height = Math.trunc(rows.value)
  const width = Math.trunc(columns.value)
  if (height < 1 || width < 1 || !Number.isFinite(height) || !Number.isFinite(width)) {
    return ERR('#VALUE!', 'MAKEARRAY dimensions must be positive')
  }
  const shapeError = arrayShapeError(height, width, 'MAKEARRAY result')
  if (shapeError) return shapeError
  const lambda = deps.requireLambda(args[2], ctx, 2)
  if (lambda.error) return lambda.error
  const out = makeMatrix(height, width)
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const result = applyLambdaForArrayCell(
        lambda.lambda,
        [
          { kind: 'number', value: row + 1 },
          { kind: 'number', value: column + 1 },
        ],
        ctx,
        deps.evaluate,
      )
      if (!result.ok) return result.error
      out[row][column] = result.value
    }
  }
  return arrayResult(out, 'MAKEARRAY result')
}
