import type { FunctionImpl, Value } from '../../../types'
import { ERR_VAL, NUM, collectNumberPairs, collectNumbers, meanOf, numberArg } from './numeric'
import { probability } from './normal-distribution'
import { fCdf, integerValue } from './distribution-primitives'
import { sampleVariance, studentTCdf } from './student-distribution'
import { regularizedGammaQ } from './special-functions'

function matrixShape(value: Value): { rows: number; cols: number; values: Value[][] } {
  if (value.kind !== 'array') return { rows: 1, cols: 1, values: [[value]] }
  const rows = value.value.length
  const cols = rows === 0 ? 0 : value.value[0].length
  return { rows, cols, values: value.value }
}

export const CHISQ_TEST: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const actual = matrixShape(args[0])
  const expected = matrixShape(args[1])
  if (actual.rows !== expected.rows || actual.cols !== expected.cols) return ERR_VAL('#N/A')
  let chi2 = 0
  let pairs = 0
  for (let r = 0; r < actual.rows; r++) {
    for (let c = 0; c < actual.cols; c++) {
      const a = actual.values[r][c]
      const e = expected.values[r][c]
      if (a.kind === 'error') return a
      if (e.kind === 'error') return e
      if (a.kind === 'number' && e.kind === 'number') {
        if (e.value === 0) return ERR_VAL('#DIV/0!')
        const diff = a.value - e.value
        chi2 += (diff * diff) / e.value
        pairs++
      }
    }
  }
  if (pairs < 2) return ERR_VAL('#DIV/0!')
  const df =
    actual.rows === 1 || actual.cols === 1 ? pairs - 1 : (actual.rows - 1) * (actual.cols - 1)
  if (df <= 0) return ERR_VAL('#DIV/0!')
  return probability(regularizedGammaQ(df / 2, chi2 / 2))
}

export const F_TEST: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const xs = collectNumbers([args[0]])
  if (!xs.ok) return xs.err
  const ys = collectNumbers([args[1]])
  if (!ys.ok) return ys.err
  const varX = sampleVariance(xs.values)
  const varY = sampleVariance(ys.values)
  if (varX === undefined || varY === undefined || varX === 0 || varY === 0) return ERR_VAL('#DIV/0!')
  const pRight = 1 - fCdf(varX / varY, xs.values.length - 1, ys.values.length - 1)
  return probability(2 * Math.min(pRight, 1 - pRight))
}

export const T_TEST: FunctionImpl = (args) => {
  if (args.length !== 4) return ERR_VAL('#VALUE!')
  const tailsRaw = numberArg(args[2])
  if (!tailsRaw.ok) return tailsRaw.err
  const typeRaw = numberArg(args[3])
  if (!typeRaw.ok) return typeRaw.err
  const tails = integerValue(tailsRaw.value)
  const testType = integerValue(typeRaw.value)
  if (
    tails === undefined ||
    testType === undefined ||
    (tails !== 1 && tails !== 2) ||
    testType < 1 ||
    testType > 3
  ) {
    return ERR_VAL('#NUM!')
  }

  let tStat: number
  let df: number
  if (testType === 1) {
    const pairs = collectNumberPairs(args[0], args[1])
    if (!pairs.ok) return pairs.err
    if (pairs.pairs.length < 2) return ERR_VAL('#DIV/0!')
    const diffs = pairs.pairs.map((pair) => pair.x - pair.y)
    const variance = sampleVariance(diffs)
    if (variance === undefined || variance === 0) return ERR_VAL('#DIV/0!')
    tStat = meanOf(diffs) / Math.sqrt(variance / diffs.length)
    df = diffs.length - 1
  } else {
    const xs = collectNumbers([args[0]])
    if (!xs.ok) return xs.err
    const ys = collectNumbers([args[1]])
    if (!ys.ok) return ys.err
    const varX = sampleVariance(xs.values)
    const varY = sampleVariance(ys.values)
    if (varX === undefined || varY === undefined) return ERR_VAL('#DIV/0!')
    const meanX = meanOf(xs.values)
    const meanY = meanOf(ys.values)
    const n1 = xs.values.length
    const n2 = ys.values.length
    if (testType === 2) {
      const pooled = ((n1 - 1) * varX + (n2 - 1) * varY) / (n1 + n2 - 2)
      if (pooled <= 0) return ERR_VAL('#DIV/0!')
      tStat = (meanX - meanY) / Math.sqrt(pooled * (1 / n1 + 1 / n2))
      df = n1 + n2 - 2
    } else {
      const seSq = varX / n1 + varY / n2
      if (seSq <= 0) return ERR_VAL('#DIV/0!')
      const dfDen = (varX / n1) ** 2 / (n1 - 1) + (varY / n2) ** 2 / (n2 - 1)
      if (dfDen <= 0) return ERR_VAL('#DIV/0!')
      tStat = (meanX - meanY) / Math.sqrt(seSq)
      df = (seSq * seSq) / dfDen
    }
  }
  if (!Number.isFinite(df) || df <= 0) return ERR_VAL('#NUM!')
  const pOne = 1 - studentTCdf(Math.abs(tStat), df)
  return probability(tails === 1 ? pOne : 2 * pOne)
}

export const FREQUENCY: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const data = collectNumbers([args[0]])
  if (!data.ok) return data.err
  const bins = collectNumbers([args[1]])
  if (!bins.ok) return bins.err
  const sortedBins = bins.values.slice().sort((a, b) => a - b)
  const counts = new Array<number>(sortedBins.length + 1).fill(0)
  for (const value of data.values) {
    let bucket = sortedBins.length
    for (let i = 0; i < sortedBins.length; i++) {
      if (value <= sortedBins[i]) {
        bucket = i
        break
      }
    }
    counts[bucket]++
  }
  return { kind: 'array', value: counts.map((count) => [NUM(count)]) }
}
