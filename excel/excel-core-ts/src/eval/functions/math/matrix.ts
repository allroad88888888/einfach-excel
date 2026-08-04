/** Matrix construction, multiplication, determinant, and inversion. */

import type { FunctionImpl, Value } from '../../../types'
import { propagateError, toNumber } from '../../coerce'
import { ERR, NUM } from './shared'

type NumericMatrixResult =
  | { ok: true; matrix: number[][] }
  | { ok: false; error: Value & { kind: 'error' } }

function numericMatrix(value: Value): NumericMatrixResult {
  const grid = value.kind === 'array' ? value.value : [[value]]
  if (grid.length === 0 || (grid[0]?.length ?? 0) === 0) {
    return { ok: false, error: ERR('#VALUE!') as Value & { kind: 'error' } }
  }
  const width = grid[0].length
  const matrix: number[][] = []
  for (const row of grid) {
    if (row.length !== width) return { ok: false, error: ERR('#VALUE!') as Value & { kind: 'error' } }
    const outRow: number[] = []
    for (const cell of row) {
      const n = toNumber(cell)
      if (!n.ok) return { ok: false, error: n.error }
      outRow.push(n.value)
    }
    matrix.push(outRow)
  }
  return { ok: true, matrix }
}

/** MUNIT(dimension) — identity matrix. */
export const MUNIT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 1) return ERR('#VALUE!')
  const dv = toNumber(args[0])
  if (!dv.ok) return dv.error
  const dim = Math.trunc(dv.value)
  if (dim < 1) return ERR('#VALUE!')
  const rows: Value[][] = []
  for (let r = 0; r < dim; r += 1) {
    const row: Value[] = []
    for (let c = 0; c < dim; c += 1) row.push(NUM(r === c ? 1 : 0))
    rows.push(row)
  }
  return { kind: 'array', value: rows }
}

/** MMULT(array1, array2) — matrix product. */
export const MMULT: FunctionImpl = (args) => {
  const propagated = propagateError(args)
  if (propagated) return propagated
  if (args.length !== 2) return ERR('#VALUE!')
  const a = numericMatrix(args[0])
  if (!a.ok) return a.error
  const b = numericMatrix(args[1])
  if (!b.ok) return b.error
  const aRows = a.matrix.length
  const aCols = a.matrix[0].length
  const bRows = b.matrix.length
  const bCols = b.matrix[0].length
  if (aCols !== bRows) return ERR('#VALUE!')
  const out: Value[][] = []
  for (let r = 0; r < aRows; r += 1) {
    const row: Value[] = []
    for (let c = 0; c < bCols; c += 1) {
      let total = 0
      for (let k = 0; k < aCols; k += 1) total += a.matrix[r][k] * b.matrix[k][c]
      row.push(NUM(total))
    }
    out.push(row)
  }
  return { kind: 'array', value: out }
}

function determinant(matrix: number[][]): number {
  const n = matrix.length
  const m = matrix.map((row) => row.slice())
  let det = 1
  for (let i = 0; i < n; i += 1) {
    let pivot = i
    for (let r = i + 1; r < n; r += 1) {
      if (Math.abs(m[r][i]) > Math.abs(m[pivot][i])) pivot = r
    }
    if (Math.abs(m[pivot][i]) < 1e-12) return 0
    if (pivot !== i) {
      [m[pivot], m[i]] = [m[i], m[pivot]]
      det *= -1
    }
    const pv = m[i][i]
    det *= pv
    for (let r = i + 1; r < n; r += 1) {
      const factor = m[r][i] / pv
      for (let c = i; c < n; c += 1) m[r][c] -= factor * m[i][c]
    }
  }
  return det
}

/** MDETERM(array) — matrix determinant. */
export const MDETERM: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR('#VALUE!')
  const m = numericMatrix(args[0])
  if (!m.ok) return m.error
  if (m.matrix.length !== m.matrix[0].length) return ERR('#VALUE!')
  return NUM(determinant(m.matrix))
}

/** MINVERSE(array) — inverse of a square numeric matrix. */
export const MINVERSE: FunctionImpl = (args) => {
  if (args.length !== 1) return ERR('#VALUE!')
  const parsed = numericMatrix(args[0])
  if (!parsed.ok) return parsed.error
  const input = parsed.matrix
  const n = input.length
  if (n !== input[0].length) return ERR('#VALUE!')
  const aug = input.map((row, r) => [
    ...row,
    ...Array.from({ length: n }, (_, c) => (r === c ? 1 : 0)),
  ])
  for (let c = 0; c < n; c += 1) {
    let pivot = c
    for (let r = c + 1; r < n; r += 1) {
      if (Math.abs(aug[r][c]) > Math.abs(aug[pivot][c])) pivot = r
    }
    if (Math.abs(aug[pivot][c]) < 1e-12) return ERR('#NUM!')
    if (pivot !== c) {
      [aug[pivot], aug[c]] = [aug[c], aug[pivot]]
    }
    const pv = aug[c][c]
    for (let j = 0; j < 2 * n; j += 1) aug[c][j] /= pv
    for (let r = 0; r < n; r += 1) {
      if (r === c) continue
      const factor = aug[r][c]
      for (let j = 0; j < 2 * n; j += 1) aug[r][j] -= factor * aug[c][j]
    }
  }
  return {
    kind: 'array',
    value: aug.map((row) => row.slice(n).map((value) => NUM(value))),
  }
}


export const FUNCTIONS: Record<string, FunctionImpl> = { MUNIT, MMULT, MDETERM, MINVERSE }
