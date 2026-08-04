import type { FunctionImpl, Value } from '../../../types'
import { ERR_VAL, NUM, type NumberArg, booleanArg, finiteNumber, meanOf, numberArg, collectNumberPairs } from './numeric'
import { regressionSums } from './regression-statistics'

/**
 * Compact, cohesive matrix linear-regression algorithm; kept together for its shared fit state.
 * Complex-file exception: decomposition, inversion, fitting, and result projection
 * share one numerical state machine, so splitting them would obscure its invariants.
 */

interface NumberMatrixResult {
  readonly ok: true
  readonly rows: number[][]
}

interface MatrixErrorResult {
  readonly ok: false
  readonly err: Value
}

type MatrixResult = NumberMatrixResult | MatrixErrorResult

function matrixArg(value: Value): MatrixResult {
  const convert = (cell: Value): NumberArg => {
    if (cell.kind === 'string') return { ok: false, err: ERR_VAL('#VALUE!') }
    return numberArg(cell)
  }
  if (value.kind !== 'array') {
    const scalar = convert(value)
    if (!scalar.ok) return { ok: false, err: scalar.err }
    return { ok: true, rows: [[scalar.value]] }
  }
  if (value.value.length === 0 || value.value[0].length === 0) {
    return { ok: false, err: ERR_VAL('#VALUE!') }
  }
  const cols = value.value[0].length
  const rows: number[][] = []
  for (const row of value.value) {
    if (row.length !== cols) return { ok: false, err: ERR_VAL('#VALUE!') }
    const outRow: number[] = []
    for (const cell of row) {
      const n = convert(cell)
      if (!n.ok) return { ok: false, err: n.err }
      outRow.push(n.value)
    }
    rows.push(outRow)
  }
  return { ok: true, rows }
}

function transposeMatrix(matrix: ReadonlyArray<ReadonlyArray<number>>): number[][] {
  const rows = matrix.length
  const cols = matrix[0].length
  const out: number[][] = Array.from({ length: cols }, () => new Array<number>(rows).fill(0))
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) out[c][r] = matrix[r][c]
  }
  return out
}

function extractKnownY(
  value: Value,
): { ok: true; values: number[]; vertical: boolean } | MatrixErrorResult {
  const matrix = matrixArg(value)
  if (!matrix.ok) return matrix
  const rows = matrix.rows.length
  const cols = matrix.rows[0].length
  if (rows === 1) return { ok: true, values: matrix.rows[0].slice(), vertical: false }
  if (cols === 1) return { ok: true, values: matrix.rows.map((row) => row[0]), vertical: true }
  return { ok: false, err: ERR_VAL('#VALUE!') }
}

function extractKnownX(
  value: Value | undefined,
  requiredRows: number,
  yVertical: boolean,
): { ok: true; rows: number[][] } | MatrixErrorResult {
  if (value === undefined) {
    return {
      ok: true,
      rows: Array.from({ length: requiredRows }, (_, index) => [index + 1]),
    }
  }
  const matrix = matrixArg(value)
  if (!matrix.ok) return matrix
  const rows = matrix.rows.length
  const cols = matrix.rows[0].length
  if (yVertical) {
    if (rows === requiredRows) return { ok: true, rows: matrix.rows.map((row) => row.slice()) }
    if (cols === requiredRows) return { ok: true, rows: transposeMatrix(matrix.rows) }
    return { ok: false, err: ERR_VAL('#N/A') }
  }
  if (cols === requiredRows) return { ok: true, rows: transposeMatrix(matrix.rows) }
  if (rows === requiredRows) return { ok: true, rows: matrix.rows.map((row) => row.slice()) }
  return { ok: false, err: ERR_VAL('#N/A') }
}

function invertMatrix(input: ReadonlyArray<ReadonlyArray<number>>): number[][] | undefined {
  const n = input.length
  if (n === 0 || input.some((row) => row.length !== n)) return undefined
  const a = input.map((row) => row.slice())
  const inv: number[][] = Array.from({ length: n }, (_row, r) =>
    Array.from({ length: n }, (_col, c) => (r === c ? 1 : 0)),
  )
  for (let i = 0; i < n; i++) {
    let pivot = i
    let pivotValue = Math.abs(a[i][i])
    for (let r = i + 1; r < n; r++) {
      const value = Math.abs(a[r][i])
      if (value > pivotValue) {
        pivotValue = value
        pivot = r
      }
    }
    if (pivotValue < 1e-12) return undefined
    if (pivot !== i) {
      const aRow = a[i]
      a[i] = a[pivot]
      a[pivot] = aRow
      const invRow = inv[i]
      inv[i] = inv[pivot]
      inv[pivot] = invRow
    }
    const divisor = a[i][i]
    for (let c = 0; c < n; c++) {
      a[i][c] /= divisor
      inv[i][c] /= divisor
    }
    for (let r = 0; r < n; r++) {
      if (r === i) continue
      const factor = a[r][i]
      if (factor === 0) continue
      for (let c = 0; c < n; c++) {
        a[r][c] -= factor * a[i][c]
        inv[r][c] -= factor * inv[i][c]
      }
    }
  }
  return inv
}

interface LinRegFit {
  readonly slopes: number[]
  readonly intercept: number
  readonly withIntercept: boolean
  readonly ssRes: number
  readonly ssTot: number
  readonly se: number[]
  readonly seIntercept: number
  readonly df: number
  readonly kVars: number
}

function linregCore(
  xs: ReadonlyArray<ReadonlyArray<number>>,
  ys: ReadonlyArray<number>,
  withIntercept: boolean,
): { ok: true; fit: LinRegFit } | MatrixErrorResult {
  const n = ys.length
  if (n === 0 || xs.length !== n) return { ok: false, err: ERR_VAL('#N/A') }
  const k = xs[0].length
  if (k === 0 || xs.some((row) => row.length !== k)) return { ok: false, err: ERR_VAL('#N/A') }
  const pEff = k + (withIntercept ? 1 : 0)
  if (n < pEff) return { ok: false, err: ERR_VAL('#N/A') }
  const design: number[][] = Array.from({ length: n }, () => new Array<number>(pEff).fill(0))
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < k; c++) design[r][c] = xs[r][c]
    if (withIntercept) design[r][pEff - 1] = 1
  }

  const xtx: number[][] = Array.from({ length: pEff }, () => new Array<number>(pEff).fill(0))
  const xty = new Array<number>(pEff).fill(0)
  for (let i = 0; i < pEff; i++) {
    for (let j = 0; j < pEff; j++) {
      let total = 0
      for (let r = 0; r < n; r++) total += design[r][i] * design[r][j]
      xtx[i][j] = total
    }
    let total = 0
    for (let r = 0; r < n; r++) total += design[r][i] * ys[r]
    xty[i] = total
  }

  const inverse = invertMatrix(xtx)
  if (!inverse) return { ok: false, err: ERR_VAL('#NUM!') }
  const betas = inverse.map((row) => row.reduce((sum, value, index) => sum + value * xty[index], 0))
  const slopes = betas.slice(0, k)
  const intercept = withIntercept ? betas[pEff - 1] : 0
  const predicted = xs.map((row) => {
    let yHat = withIntercept ? intercept : 0
    for (let c = 0; c < k; c++) yHat += row[c] * slopes[c]
    return yHat
  })
  const yMean = meanOf(ys)
  let ssRes = 0
  let ssTot = 0
  for (let i = 0; i < n; i++) {
    const residual = ys[i] - predicted[i]
    ssRes += residual * residual
    const centered = withIntercept ? ys[i] - yMean : ys[i]
    ssTot += centered * centered
  }
  const df = n - pEff
  const mse = df > 0 ? ssRes / df : 0
  const se = slopes.map((_, index) => {
    const variance = inverse[index][index] * mse
    return variance > 0 ? Math.sqrt(variance) : 0
  })
  const seIntercept = withIntercept && df > 0
    ? Math.sqrt(Math.max(inverse[pEff - 1][pEff - 1] * mse, 0))
    : 0
  return {
    ok: true,
    fit: {
      slopes,
      intercept,
      withIntercept,
      ssRes,
      ssTot,
      se,
      seIntercept,
      df,
      kVars: k,
    },
  }
}

function linestArray(fit: LinRegFit, stats: boolean, expCoefs: boolean): Value {
  const cols = fit.kVars + 1
  const firstRow: Value[] = []
  for (let i = 0; i < fit.kVars; i++) {
    const slope = fit.slopes[fit.kVars - 1 - i]
    firstRow.push(NUM(expCoefs ? Math.exp(slope) : slope))
  }
  firstRow.push(NUM(expCoefs ? Math.exp(fit.intercept) : fit.intercept))
  if (!stats) return { kind: 'array', value: [firstRow] }

  const rows: Value[][] = [firstRow]
  const seRow: Value[] = []
  for (let i = 0; i < fit.kVars; i++) seRow.push(NUM(fit.se[fit.kVars - 1 - i]))
  seRow.push(NUM(fit.seIntercept))
  rows.push(seRow)

  const r2 = fit.ssTot > 0 ? 1 - fit.ssRes / fit.ssTot : 0
  const seY = fit.df > 0 ? Math.sqrt(fit.ssRes / fit.df) : 0
  rows.push([NUM(r2), NUM(seY), ...Array.from({ length: Math.max(0, cols - 2) }, () => ERR_VAL('#N/A'))])

  const ssReg = Math.max(fit.ssTot - fit.ssRes, 0)
  const fStat = fit.kVars > 0 && fit.df > 0 && fit.ssRes > 0
    ? (ssReg / fit.kVars) / (fit.ssRes / fit.df)
    : 0
  rows.push([NUM(fStat), NUM(fit.df), ...Array.from({ length: Math.max(0, cols - 2) }, () => ERR_VAL('#N/A'))])
  rows.push([NUM(ssReg), NUM(fit.ssRes), ...Array.from({ length: Math.max(0, cols - 2) }, () => ERR_VAL('#N/A'))])
  return { kind: 'array', value: rows }
}

function linestFlags(
  args: Value[],
  offset: number,
): { ok: true; withIntercept: boolean; stats: boolean } | MatrixErrorResult {
  let withIntercept = true
  let stats = false
  if (args.length > offset) {
    const flag = booleanArg(args[offset])
    if (!flag.ok) return { ok: false, err: flag.err }
    withIntercept = flag.value
  }
  if (args.length > offset + 1) {
    const flag = booleanArg(args[offset + 1])
    if (!flag.ok) return { ok: false, err: flag.err }
    stats = flag.value
  }
  return { ok: true, withIntercept, stats }
}

function lineEst(args: Value[], logY: boolean): Value {
  if (args.length < 1 || args.length > 4) return ERR_VAL('#VALUE!')
  const y = extractKnownY(args[0])
  if (!y.ok) return y.err
  const ys = y.values.slice()
  if (logY) {
    for (let i = 0; i < ys.length; i++) {
      if (ys[i] <= 0) return ERR_VAL('#NUM!')
      ys[i] = Math.log(ys[i])
    }
  }
  const x = extractKnownX(args.length >= 2 ? args[1] : undefined, ys.length, y.vertical)
  if (!x.ok) return x.err
  const flags = linestFlags(args, 2)
  if (!flags.ok) return flags.err
  const fit = linregCore(x.rows, ys, flags.withIntercept)
  if (!fit.ok) return fit.err
  return linestArray(fit.fit, flags.stats, logY)
}

function trendGrowth(args: Value[], logY: boolean): Value {
  if (args.length < 1 || args.length > 4) return ERR_VAL('#VALUE!')
  const y = extractKnownY(args[0])
  if (!y.ok) return y.err
  const ys = y.values.slice()
  if (logY) {
    for (let i = 0; i < ys.length; i++) {
      if (ys[i] <= 0) return ERR_VAL('#NUM!')
      ys[i] = Math.log(ys[i])
    }
  }
  const x = extractKnownX(args.length >= 2 ? args[1] : undefined, ys.length, y.vertical)
  if (!x.ok) return x.err
  let withIntercept = true
  if (args.length >= 4) {
    const flag = booleanArg(args[3])
    if (!flag.ok) return flag.err
    withIntercept = flag.value
  }
  const fit = linregCore(x.rows, ys, withIntercept)
  if (!fit.ok) return fit.err

  let newXs: number[][]
  if (args.length >= 3) {
    const matrix = matrixArg(args[2])
    if (!matrix.ok) return matrix.err
    const rows = matrix.rows.length
    const cols = matrix.rows[0].length
    const k = fit.fit.kVars
    if (cols === k) {
      newXs = matrix.rows.map((row) => row.slice())
    } else if (rows === k) {
      newXs = transposeMatrix(matrix.rows)
    } else if (k === 1 && (rows === 1 || cols === 1)) {
      newXs =
        rows === 1 ? matrix.rows[0].map((value) => [value]) : matrix.rows.map((row) => [row[0]])
    } else {
      return ERR_VAL('#N/A')
    }
  } else {
    newXs = x.rows.map((row) => row.slice())
  }

  const predictions = newXs.map((row) => {
    let yHat = fit.fit.withIntercept ? fit.fit.intercept : 0
    for (let c = 0; c < fit.fit.kVars; c++) yHat += row[c] * fit.fit.slopes[c]
    return NUM(logY ? Math.exp(yHat) : yHat)
  })
  return {
    kind: 'array',
    value: y.vertical ? predictions.map((value) => [value]) : [predictions],
  }
}

export const LINEST: FunctionImpl = (args) => lineEst(args, false)
export const LOGEST: FunctionImpl = (args) => lineEst(args, true)
export const TREND: FunctionImpl = (args) => trendGrowth(args, false)
export const GROWTH: FunctionImpl = (args) => trendGrowth(args, true)

export const STEYX: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const pairs = collectNumberPairs(args[1], args[0])
  if (!pairs.ok) return pairs.err
  if (pairs.pairs.length < 3) return ERR_VAL('#DIV/0!')
  const { sxx, sxy, syy } = regressionSums(pairs.pairs)
  if (sxx === 0) return ERR_VAL('#DIV/0!')
  const variance = Math.max((syy - (sxy * sxy) / sxx) / (pairs.pairs.length - 2), 0)
  return finiteNumber(Math.sqrt(variance))
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------
