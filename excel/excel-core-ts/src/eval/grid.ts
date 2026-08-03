/**
 * `Grid` —— 广播语义下的网格视图。
 *
 * 职责：把任意 `Value` 看成一张按 Excel 广播规则（1 行 / 1 列可拉伸）取格的
 * rows×cols 网格。
 */
import type { Value } from '../types'
import { ERR } from './error-value'
import { arrayShapeError, matrixScalarCellError } from './array-shape'

export interface Grid {
  readonly rows: number
  readonly cols: number
  readonly cells: Value[][]
}

export function valueToGrid(
  value: Value,
): { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value } {
  if (value.kind !== 'array') {
    return { grid: { rows: 1, cols: 1, cells: [[value]] } }
  }
  const rows = value.value.length
  const cols = value.value[0]?.length ?? 0
  const shapeError = arrayShapeError(rows, cols, 'array result', 'array result exceeds cell cap')
  if (shapeError) return { error: shapeError }
  for (const row of value.value) {
    if (row.length !== cols) return { error: ERR('#VALUE!', 'array rows must be rectangular') }
  }
  const scalarError = matrixScalarCellError(value.value)
  if (scalarError) return { error: scalarError }
  return { grid: { rows, cols, cells: value.value } }
}

export function makeMatrix(rows: number, cols: number): Value[][] {
  const out: Value[][] = new Array(rows)
  for (let r = 0; r < rows; r += 1) {
    out[r] = new Array(cols)
  }
  return out
}

export function pickBroadcastCell(grid: Grid, row: number, col: number): Value {
  return grid.cells[grid.rows === 1 ? 0 : row][grid.cols === 1 ? 0 : col]
}

export function broadcastExtent(left: number, right: number): number | undefined {
  if (left === right) return left
  if (left === 1) return right
  if (right === 1) return left
  return undefined
}

export function valueBroadcastGrid(
  value: Value,
  rows: number,
  cols: number,
): { readonly grid: Grid; readonly error?: undefined } | { readonly error: Value } {
  const grid = valueToGrid(value)
  if (grid.error) return { error: grid.error }
  if (
    broadcastExtent(grid.grid.rows, rows) !== rows ||
    broadcastExtent(grid.grid.cols, cols) !== cols
  ) {
    return { error: ERR('#VALUE!') }
  }
  return { grid: grid.grid }
}
