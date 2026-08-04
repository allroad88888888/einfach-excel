import type { FunctionImpl, Value } from '../../../types'
import { toNumber } from '../../coerce'
import {
  ERR_VAL,
  type NumberPair,
  collectNumberPairs,
  collectNumbers,
  finiteNumber,
  meanOf,
  sumSquaredDeviations,
} from './numeric'

export function regressionSums(pairs: ReadonlyArray<NumberPair>): {
  readonly sxx: number
  readonly sxy: number
  readonly syy: number
  readonly meanX: number
  readonly meanY: number
} {
  const meanX = pairs.reduce((sum, pair) => sum + pair.x, 0) / pairs.length
  const meanY = pairs.reduce((sum, pair) => sum + pair.y, 0) / pairs.length
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const pair of pairs) {
    const dx = pair.x - meanX
    const dy = pair.y - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }
  return { sxx, sxy, syy, meanX, meanY }
}

/** RSQ(known_ys, known_xs) — square of Pearson correlation. */
export const RSQ: FunctionImpl = (args) => {
  if (args.length !== 2) return ERR_VAL('#VALUE!')
  const pairs = collectNumberPairs(args[1], args[0])
  if (!pairs.ok) return pairs.err
  if (pairs.pairs.length < 2) return ERR_VAL('#DIV/0!')
  const { sxx, sxy, syy } = regressionSums(pairs.pairs)
  if (sxx === 0 || syy === 0) return ERR_VAL('#DIV/0!')
  return finiteNumber((sxy * sxy) / (sxx * syy))
}

/** SKEW — sample skewness. */
export const SKEW: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  const n = r.values.length
  if (n < 3) return ERR_VAL('#NUM!')
  const mean = meanOf(r.values)
  const variance = sumSquaredDeviations(r.values, mean) / (n - 1)
  const standardDev = Math.sqrt(variance)
  if (standardDev === 0) return ERR_VAL('#DIV/0!')
  const sumCubed = r.values.reduce((sum, value) => sum + ((value - mean) / standardDev) ** 3, 0)
  return finiteNumber((n / ((n - 1) * (n - 2))) * sumCubed)
}

/** SKEW.P — population skewness. */
export const SKEW_P: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  const n = r.values.length
  if (n < 3) return ERR_VAL('#NUM!')
  const mean = meanOf(r.values)
  const variance = sumSquaredDeviations(r.values, mean) / n
  const standardDev = Math.sqrt(variance)
  if (standardDev === 0) return ERR_VAL('#DIV/0!')
  const thirdMoment = r.values.reduce((sum, value) => sum + (value - mean) ** 3, 0) / n
  return finiteNumber(thirdMoment / standardDev ** 3)
}

/** KURT — sample excess kurtosis. */
export const KURT: FunctionImpl = (args) => {
  const r = collectNumbers(args)
  if (!r.ok) return r.err
  const n = r.values.length
  if (n < 4) return ERR_VAL('#NUM!')
  const mean = meanOf(r.values)
  const variance = sumSquaredDeviations(r.values, mean) / (n - 1)
  const standardDev = Math.sqrt(variance)
  if (standardDev === 0) return ERR_VAL('#DIV/0!')
  const sumFourth = r.values.reduce((sum, value) => sum + ((value - mean) / standardDev) ** 4, 0)
  const excess =
    (n * (n + 1) * sumFourth) / ((n - 1) * (n - 2) * (n - 3)) -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
  return finiteNumber(excess)
}

/** FORECAST / FORECAST.LINEAR — simple linear-regression prediction. */
export const FORECAST: FunctionImpl = (args) => {
  if (args.length !== 3) return ERR_VAL('#VALUE!')
  const xAt = toNumber(args[0])
  if (!xAt.ok) return xAt.error
  const pairs = collectNumberPairs(args[2], args[1])
  if (!pairs.ok) return pairs.err
  if (pairs.pairs.length < 2) return ERR_VAL('#DIV/0!')
  const { sxx, sxy, meanX, meanY } = regressionSums(pairs.pairs)
  if (sxx === 0) return ERR_VAL('#DIV/0!')
  return finiteNumber(meanY + (sxy / sxx) * (xAt.value - meanX))
}

function truncateDigits(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.trunc(value * scale) / scale
}

function percentRank(args: Value[], exclusive: boolean): Value {
  if (args.length < 2 || args.length > 3) return ERR_VAL('#VALUE!')
  const x = toNumber(args[1])
  if (!x.ok) return x.error
  let significance = 3
  if (args.length === 3) {
    const s = toNumber(args[2])
    if (!s.ok) return s.error
    significance = Math.trunc(s.value)
    if (significance < 1) return ERR_VAL('#NUM!')
  }
  const r = collectNumbers([args[0]])
  if (!r.ok) return r.err
  if (r.values.length === 0) return ERR_VAL('#NUM!')
  const sorted = r.values.slice().sort((a, b) => a - b)
  const last = sorted.length - 1
  if (x.value < sorted[0] || x.value > sorted[last]) return ERR_VAL('#N/A')

  let lowerIndex = 0
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= x.value) lowerIndex = i
    else break
  }
  const exact = sorted[lowerIndex] === x.value
  const fraction = exact
    ? 0
    : (x.value - sorted[lowerIndex]) / (sorted[lowerIndex + 1] - sorted[lowerIndex])
  const position = lowerIndex + fraction
  const rank = exclusive
    ? (position + 1) / (sorted.length + 1)
    : sorted.length === 1
      ? 1
      : position / last
  return finiteNumber(truncateDigits(rank, significance))
}

export const PERCENTRANK: FunctionImpl = (args) => percentRank(args, false)
export const PERCENTRANK_EXC: FunctionImpl = (args) => percentRank(args, true)

/** PROB(x_range, prob_range, lower_limit, [upper_limit]). */
export const PROB: FunctionImpl = (args) => {
  if (args.length < 3 || args.length > 4) return ERR_VAL('#VALUE!')
  const pairs = collectNumberPairs(args[0], args[1])
  if (!pairs.ok) return pairs.err
  if (pairs.pairs.length === 0) return ERR_VAL('#NUM!')

  let probSum = 0
  for (const pair of pairs.pairs) {
    if (pair.y <= 0 || pair.y > 1) return ERR_VAL('#NUM!')
    probSum += pair.y
  }
  if (Math.abs(probSum - 1) > 1e-9) return ERR_VAL('#NUM!')

  const lower = toNumber(args[2])
  if (!lower.ok) return lower.error
  const upper = args.length === 4 ? toNumber(args[3]) : lower
  if (!upper.ok) return upper.error
  const lo = Math.min(lower.value, upper.value)
  const hi = Math.max(lower.value, upper.value)
  let total = 0
  for (const pair of pairs.pairs) {
    if (pair.x >= lo && pair.x <= hi) total += pair.y
  }
  return finiteNumber(total)
}

// ---------------------------------------------------------------------------
// Distribution and test functions
// ---------------------------------------------------------------------------
